// Unified DB driver. SQLite today (`node:sqlite`), PostgreSQL later (`pg`).
// Routes/repositories call getDb(); both drivers expose the same call shapes.
//
// SQLite driver (current): synchronous — `prepare().get/all/run` return values.
// PostgreSQL driver (future): the same methods return Promises — repositories
// must `await` when the swap happens. Keep SQL portable (see migrations/README).
const path = require('path');

let driver = null;

function createSqliteDriver() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.SQLITE_PATH || path.join(__dirname, '..', 'scorecard.db'));
  return {
    kind: 'sqlite',
    prepare: (sql) => db.prepare(sql),
    exec: (sql) => db.exec(sql),
    // node:sqlite has no .transaction() helper — callers use exec BEGIN/COMMIT.
    raw: db,
  };
}

function createPostgresDriver() {
  // Lazy-load `pg` only when DATABASE_URL is set — keeps SQLite installs free
  // of the optional dependency.
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return {
    kind: 'postgres',
    pool,
    // Async-compatible prepare wrapper: callers await .get/.all/.run results.
    prepare(sql) {
      const params = [];
      const stmt = {
        get: async (...p) => { const r = await pool.query(sql, p); return r.rows[0]; },
        all: async (...p) => { const r = await pool.query(sql, p); return r.rows; },
        run: async (...p) => { const r = await pool.query(sql, p); return { changes: r.rowCount, lastInsertRowid: r.rows[0] && r.rows[0].id }; },
        // allow chaining params then calling get/all/run
        _params: params,
      };
      // Support db.prepare(sql).get(a, b) style used everywhere.
      return stmt;
    },
    exec: async (sql) => { await pool.query(sql); },
    raw: pool,
  };
}

function getDb() {
  if (driver) return driver;
  if (process.env.DATABASE_URL && process.env.DB_DRIVER === 'postgres') {
    driver = createPostgresDriver();
    console.log('[db] Using PostgreSQL driver');
  } else {
    driver = createSqliteDriver();
    console.log(`[db] Using SQLite driver (${process.env.SQLITE_PATH || 'backend/scorecard.db'})`);
  }
  return driver;
}

// Back-compat: existing code does `require('../database')` and gets a DatabaseSync.
// Keep that path working; new code should use getDb().
module.exports = getDb();
module.exports.getDb = getDb;
module.exports.createSqliteDriver = createSqliteDriver;
module.exports.createPostgresDriver = createPostgresDriver;
