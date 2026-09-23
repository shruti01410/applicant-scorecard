const db = require('./database');

// Activity / telemetry schema for the Admin Panel. Tables are additive; the
// existing scorecard tables remain untouched.
db.exec(`
  CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    role TEXT,
    method TEXT DEFAULT 'password',
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    role TEXT,
    event_type TEXT NOT NULL,
    module TEXT NOT NULL,
    entity_id TEXT,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    method TEXT,
    path TEXT,
    status INTEGER,
    duration_ms REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT,
    stack TEXT,
    path TEXT,
    method TEXT,
    module TEXT DEFAULT 'server',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    fingerprint TEXT UNIQUE,
    read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS role_definitions (
    role TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (role, permission)
  );

  CREATE TABLE IF NOT EXISTS org_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activity_module_time ON activity_logs(module, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_event_time ON activity_logs(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_login_time ON login_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_metrics_time ON api_metrics(created_at);
  CREATE INDEX IF NOT EXISTS idx_errors_time ON error_logs(created_at);
`);

try {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
  if (cols.length && !cols.includes('last_login_at')) db.exec('ALTER TABLE users ADD COLUMN last_login_at DATETIME');
  if (cols.length && !cols.includes('status')) db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended'))");
} catch (e) {}

try {
  const mCols = db.prepare('PRAGMA table_info(api_metrics)').all().map((r) => r.name);
  if (mCols.length && !mCols.includes('user_id')) db.exec('ALTER TABLE api_metrics ADD COLUMN user_id INTEGER');
} catch (e) {}

const PERMISSIONS = [
  'dashboard.view', 'users.view', 'users.manage', 'scorecard.view', 'scorecard.manage',
  'intelligence.view', 'evaluations.view', 'evaluations.manage', 'candidates.view', 'candidates.manage',
  'roles.manage', 'content.view', 'content.manage', 'notifications.view', 'settings.view', 'settings.manage',
  'audit.view', 'health.view',
];

const ROLE_DEFAULT_PERMISSIONS = {
  'super-admin': PERMISSIONS,
  admin: PERMISSIONS,
  recruiter: ['dashboard.view', 'users.view', 'scorecard.view', 'intelligence.view', 'candidates.view', 'notifications.view', 'evaluations.view'],
  evaluator: ['dashboard.view', 'scorecard.view', 'intelligence.view', 'evaluations.view', 'candidates.view'],
  'panel-member': ['dashboard.view', 'evaluations.view'],
  candidate: ['scorecard.view'],
};

// Seed role definitions + default permission matrix once.
try {
  const seedRoles = [
    ['super-admin', 'Super Admin', 'Full control — users, settings, approvals, audit.'],
    ['admin', 'Admin', 'Day-to-day operations, analytics, candidates and scorecards.'],
    ['recruiter', 'Recruiter', 'Adds candidates, runs evaluations, sees analytics.'],
    ['evaluator', 'Evaluator', 'Submits scores and evaluates candidates.'],
    ['panel-member', 'Panel Member', 'Member of approval/decision panels.'],
    ['candidate', 'Candidate', 'Read-only access to their own scorecard.'],
  ];
  const insRole = db.prepare('INSERT OR IGNORE INTO role_definitions (role, label, description) VALUES (?, ?, ?)');
  for (const [r, l, d] of seedRoles) insRole.run(r, l, d);
  const insPerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
  for (const [r, perms] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
    for (const p of perms) insPerm.run(r, p);
  }
} catch (e) {}

function sqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// Resolve a time range into a SQL `since` timestamp (UTC, sqlite format).
// Accepts: today | 7d | 30d | 90d | custom (from/to ISO dates or datetimes).
function rangeSince(range, from, to) {
  const now = sqlNow();
  if (!range) return { since: null, from: null, to: null, label: 'All time' };
  if (range === 'today') {
    return { since: sqlNowDateStart(), from: sqlNowDateStart(), to: now, label: 'Today' };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 0;
  if (days) {
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { since: toSql(d), from: toSql(d), to: now, label: `${days} days` };
  }
  if (range === 'custom') {
    const f = toSql(new Date(from));
    const t = to ? toSql(new Date(to)) : now;
    return { since: f, from: f, to: t, label: 'Custom' };
  }
  return { since: null, from: null, to: null, label: 'All time' };
}

function toSql(d) {
  if (!d || Number.isNaN(new Date(d).getTime())) return null;
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

function sqlNowDateStart() {
  return new Date().toISOString().slice(0, 10) + ' 00:00:00';
}

function whereSince(since, col = 'created_at') {
  // `since` is inclusive; adding a day boundary would need end hooks — use
  // `>=` which is fine for trend ranges.
  return { sql: since ? `AND ${col} >= ?` : '', params: since ? [since] : [] };
}

function logLogin({ userId, username, role, method = 'password', ip, userAgent }) {
  try {
    db.prepare(`
      INSERT INTO login_logs (user_id, username, role, method, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId || null, username || null, role || null, method || 'password', ip || null, (userAgent || '').slice(0, 300) || null);
    if (userId) db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(sqlNow(), userId);
  } catch (e) {}
}

// Delegates to the single audit writer so admin-panel and core routes share
// one INSERT shape (columns must stay in sync with database.js audit_logs).
function logAudit({ userId, username, action, module, detail }) {
  require('./audit').logAudit({ performedBy: userId || null, username, action, module, detail });
}

function logActivity({ userId, username, role, eventType, module, entityId, detail }) {
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, username, role, event_type, module, entity_id, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId || null, username || null, role || 'admin', eventType, module, String(entityId == null ? '' : entityId) || null, detail || null);
  } catch (e) {}
}

function recordRequest(method, path, status, durationMs, userId) {
  try {
    db.prepare('INSERT INTO api_metrics (user_id, method, path, status, duration_ms) VALUES (?, ?, ?, ?, ?)')
      .run(userId || null, String(method || '').toUpperCase(), String(path || '').slice(0, 500), status || 0, Math.round((durationMs || 0) * 10) / 10);
  } catch (e) {
    console.error('[aperr]', e.message);
  }
}

function recordError({ message, stack, path, method, module = 'server' }) {
  try {
    db.prepare('INSERT INTO error_logs (message, stack, path, method, module) VALUES (?, ?, ?, ?, ?)')
      .run(String(message || 'Unknown error').slice(0, 2000), String(stack || '').slice(0, 5000), String(path || '').slice(0, 500), String(method || '').toUpperCase(), String(module || 'server').slice(0, 60));
  } catch (e) {}
}

// Feature-flag read: org_settings `settings.feature.<key>` overrides env var;
// falls back to process.env when the preference is not stored.
function featureEnabled(key) {
  try {
    const row = db.prepare('SELECT value FROM org_settings WHERE key = ?').get(`settings.feature.${key}`);
    if (row) return row.value === 'true' || row.value === '1';
  } catch (e) {}
  return process.env[key] === 'true' || process.env[key] === '1';
}

function setFeature(key, enabled) {
  const k = `settings.feature.${key}`;
  const v = enabled ? 'true' : 'false';
  db.prepare(`INSERT INTO org_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);
  return v === 'true';
}

function createNotification({ type, title, body, userId, link, fingerprint }) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link, fingerprint)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO NOTHING
    `).run(userId || null, type, title, body || null, link || null, fingerprint || null);
    const r = db.prepare("SELECT changes() AS changed").get();
    return r && r.changed ? 1 : 0;
  } catch (e) {
    return 0;
  }
}

module.exports = {
  sqlNow, toSql, rangeSince, whereSince, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS,
  logLogin, logAudit, logActivity, recordRequest, recordError,
  featureEnabled, setFeature, createNotification,
};