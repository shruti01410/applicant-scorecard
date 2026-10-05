// Candidate-account cleanup for the Users & Access list.
//
// These rows are candidates imported into `users` (role=employee) — they show
// up in the team list but are not team members. This script honors the admin's
// chosen policy: "delete only if no references".
//
//   - If a row has ZERO references in every FK table -> HARD DELETE (safe).
//   - If a row has ANY references (scorecard/panel/audit/metrics/numerology)
//     -> the row is KEPT but flagged hidden_from_team=1 so it disappears from
//     the Users & Access list without orphaning any linked rows.
//
// Usage:
//   node scripts/cleanupCandidateAccounts.js            -> DRY RUN (prints plan, no changes)
//   node scripts/cleanupCandidateAccounts.js --apply    -> actually runs
//
// After running, the audit table gets a row for every account we acted on.

const db = require('../database');

const APPLY = process.argv.includes('--apply');

// Every users.id reference in the schema (table -> FK column). If a new table
// references users.id, add it here so the tally stays correct.
const REFS = [
  ['scorecards', 'employee_id'],
  ['scorecard_snapshots', 'employee_id'],
  ['audit_logs', 'performed_by'],
  ['audit_logs', 'user_id'],
  ['api_metrics', 'user_id'],
  ['numerology_profiles', 'employee_id'],
  ['user_mfa', 'user_id'],
  ['user_totp_secrets', 'user_id'],
  ['approval_workflows', 'candidate_id'],
  ['approval_panels', 'workflow_id'],
  ['approval_members', 'user_id'],
  ['approval_members', 'panel_id'],
  ['approval_history', 'performed_by'],
  ['login_attempts', 'user_id'],
  ['session_tokens', 'user_id'],
  ['notifications', 'user_id'],
  ['notification_reads', 'user_id'],
  ['email_drafts', 'created_by'],
  ['candidate_emails', 'candidate_id'],
  ['scorecards', 'id'],
];

function refCountFor(userId) {
  let total = 0;
  const found = [];
  for (const [tbl, col] of REFS) {
    if (tbl === 'scorecards' && col === 'id') continue NW;
    try {
      const exists = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(tbl);
      if (!exists) continue;
    } catch (e) { continue; }
    try {
      const r = db.prepare(`SELECT COUNT(*) AS c FROM "${tbl}" WHERE "${col}" = ?`).get(userId);
      if (r && r.c > 0) { total += r.c; found.push(`${tbl}.${col}=${r.c}`); }
    } catch (e) { /* table/col may not exist — ignore */ }
  }
  return { total, found };
}

function hasHiddenColumn() {
  try {
    const c = db.prepare(`PRAGMA table_info(users)`).all().map((x) => x.name);
    return c.includes('hidden_from_team');
  } catch (e) { return false; }
}

function ensureHiddenColumn() {
  if (!hasHiddenColumn()) {
    db.exec(`ALTER TABLE users ADD COLUMN hidden_from_team INTEGER DEFAULT 0`);
  }
}

function loadCandidates() {
  // Candidate-imported accounts: employee role, never logged in.
  return db.prepare(`
    SELECT id, username, name, email, role,
           (SELECT COUNT(*) FROM scorecards sc WHERE sc.employee_id = u.id) AS sc_count
    FROM users u
    WHERE u.role = 'employee' AND u.last_login_at IS NULL
    ORDER BY u.id
  `).all();
}

const rows = loadCandidates();
const toDelete = [];
const toHide = [];

for (const row of rows) {
  const { total, found } = refCountFor(row.id);
  if (total === 0) {
    toDelete.push(row);
  } else {
    toHide.push({ ...row, refs: found });
  }
}

if (APPLY) ensureHiddenColumn();

function audit(userId, username, action, detail) {
  try {
    const performed = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    db.prepare(
      'INSERT INTO audit_logs (performed_by, user_id, username, action, module, detail) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(performed ? performed.id : null, userId, username, action, 'users', detail);
  } catch (e) {}
}

console.log('=== Candidate-account cleanup ===');
console.log('Scanned ' + rows.length + ' never-logged-in employee account(s).');

console.log('\n[1] DELETE (zero references — safe):');
for (const d of toDelete) {
  console.log('  DELETE #' + d.id + ' ' + d.username + ' (' + (d.name || '') + ' / ' + (d.email || '') + ')');
}
if (toDelete.length === 0) console.log('  — none');

console.log('\n[2] HIDE from team list (has references — kept, flagged):');
for (const h of toHide) {
  console.log('  HIDE  #' + h.id + ' ' + h.username + ' (' + (h.name || '') + ') refs: ' + (h.refs && h.refs.length ? h.refs.join(', ') : 'scorecard-linked'));
}
if (toHide.length === 0) console.log('  — none');

if (APPLY) {
  console.log('\nApplying…');
  db.exec('BEGIN');
  try {
    for (const d of toDelete) {
      db.prepare('DELETE FROM users WHERE id = ?').run(d.id);
      audit(d.id, d.username, 'cleanup_removed_candidate', 'Removed candidate account (no references): ' + (d.name || d.username));
    }
    for (const h of toHide) {
      db.prepare('UPDATE users SET hidden_from_team = 1 WHERE id = ?').run(h.id);
      audit(h.id, h.username, 'cleanup_hid_candidate', 'Hidden candidate account from team list (has references): ' + (h.name || h.username));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('\nERROR — rolled back: ' + e.message);
    process.exit(1);
  }
  console.log('\nDone. Deleted ' + toDelete.length + ', hidden ' + toHide.length + '.');
} else {
  console.log('\nDry run complete — nothing changed. Re-run with --apply to execute.');
}
