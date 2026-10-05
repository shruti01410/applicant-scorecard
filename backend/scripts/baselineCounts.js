// Read-only baseline counts for pre/post migration verification.
// NEVER writes to the database (opens with readOnly: true).
// Usage: node scripts/baselineCounts.js [path/to/scorecard.db]
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const target = process.argv[2] || process.env.SQLITE_PATH || path.join(__dirname, '..', 'scorecard.db');
const db = new DatabaseSync(target, { readOnly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log(`DB: ${target}`);
console.log(`Tables: ${tables.length}`);
console.log('');
console.log('TABLE COUNTS');
for (const t of tables) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  console.log(`  ${t.padEnd(28)} ${n}`);
}

console.log('');
console.log('USERS BY ROLE/STATUS');
const byRole = db
  .prepare("SELECT role, COALESCE(status,'active') AS status, COUNT(*) AS n FROM users GROUP BY role, status ORDER BY role, status")
  .all();
for (const r of byRole) console.log(`  ${r.role}/${r.status}: ${r.n}`);

console.log('');
console.log('ORGANIZATIONS');
for (const o of db.prepare('SELECT id, name, slug FROM organizations ORDER BY id').all()) {
  console.log(`  #${o.id} ${o.name} (${o.slug})`);
}
const orphanUsers = db.prepare('SELECT COUNT(*) AS n FROM users WHERE organization_id IS NULL').get().n;
console.log(`  users with NULL organization_id: ${orphanUsers}`);

console.log('');
console.log('ADMIN ACCOUNTS');
const admins = db
  .prepare("SELECT id, username, email, role, status, organization_id, auth_provider FROM users WHERE role='admin' ORDER BY id")
  .all();
if (!admins.length) console.log('  !! NONE FOUND');
for (const a of admins) {
  console.log(`  #${a.id} ${a.username} | ${a.email || '-'} | status=${a.status || 'active'} | org=${a.organization_id} | auth=${a.auth_provider || 'local'}`);
}

console.log('');
console.log(`DB SHA256: ${require('crypto').createHash('sha256').update(require('fs').readFileSync(target)).digest('hex')}`);
