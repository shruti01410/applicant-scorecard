const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

function seededDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE, password TEXT, role TEXT NOT NULL,
      name TEXT NOT NULL, email TEXT
    );
    CREATE TABLE gmail_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE, account_email TEXT NOT NULL,
      access_token TEXT NOT NULL, refresh_token TEXT, scopes TEXT NOT NULL DEFAULT '',
      expires_at TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE recruiter_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firebase_uid TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL UNIQUE,
      name TEXT, email TEXT NOT NULL, photo_url TEXT,
      google_account_connected INTEGER NOT NULL DEFAULT 0,
      gmail_authorized INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (username, password, role, name, email)
    VALUES ('test123', 'x', 'admin', 'Admin User', 'admin@scorecard.com');
    INSERT INTO users (username, password, role, name, email)
    VALUES ('risha', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com');
    INSERT INTO users (username, password, role, name, email)
    VALUES ('sai', 'x', 'employee', 'Sai Kumar', 'sai@example.com');
  `);
  return db;
}

async function req(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function withApi(db, verifyFn, configured = true, handler) {
  const dbPath = require.resolve('../database');
  const fbPath = require.resolve('../firebaseAuth');
  const authPath = require.resolve('../routes/auth');
  const savedDb = require.cache[dbPath];
  const savedFb = require.cache[fbPath];
  const savedAuth = require.cache[authPath];
  let server;
  try {
    require.cache[dbPath] = { exports: db };
    delete require.cache[fbPath];
    require.cache[fbPath] = {
      exports: {
        isFirebaseConfigured: () => configured,
        verifyGoogleIdToken: async (token) => verifyFn(token),
      },
    };
    delete require.cache[authPath];
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const result = await handler(base);
    return result;
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    require.cache[dbPath] = savedDb;
    require.cache[fbPath] = savedFb;
    require.cache[authPath] = savedAuth;
  }
}

test('FA1. google login returns 503 when Firebase is not configured', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'u1', email: 'risha@scorecard.com', email_verified: true }), false, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /not configured/i);
  });
});

test('FA2. a verified admin Google email issues a token and creates a profile', async () => {
  const db = seededDb();
  await withApi(db, (token) => {
    assert.equal(token, 'TOKEN_RISHA');
    return { uid: 'fb-risha-1', name: 'Risha S', email: 'risha@scorecard.com', email_verified: true, picture: 'http://pic/r1' };
  }, true, async (base) => {
    const r = await req(base, '/google', { idToken: 'TOKEN_RISHA' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Risha S');
    assert.equal(r.body.user.firebase_uid, 'fb-risha-1');
  });
});

test('FA3. matching admin email returns 200 with firebase profile info', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'fb-a1', name: 'Risha S', email: 'risha@scorecard.com', email_verified: true, picture: null }), true, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal(r.body.user.role, 'admin');
    assert.equal(r.body.user.email, 'risha@scorecard.com');
    assert.equal(r.body.user.firebase_uid, 'fb-a1');
    assert.equal(r.body.user.login_method, 'google');

    const row = db.prepare('SELECT * FROM recruiter_profiles').get();
    assert.ok(row);
    assert.equal(row.firebase_uid, 'fb-a1');
    assert.equal(row.user_id, 2);
    assert.equal(row.google_account_connected, 1);

    // second login for the same account -> exactly one profile row
    const r2 = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r2.status, 200);
    const count = db.prepare('SELECT COUNT(*) c FROM recruiter_profiles').get().c;
    assert.equal(count, 1);
  });
});

test('FA4. a Google email not linked to an admin is rejected 403', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'fb-x', name: 'Stranger', email: 'stranger@gmail.com', email_verified: true, picture: null }), true, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /not linked to a recruiter account/);
  });
});

test('FA5. an unverified email is rejected 401', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'fb-u', name: 'Risha', email: 'risha@scorecard.com', email_verified: false, picture: null }), true, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 401);
    assert.match(r.body.error, /no verified email/);
  });
});

test('FA6. an invalid/expired Google token is rejected 401', async () => {
  const db = seededDb();
  await withApi(db, () => { throw new Error('invalid token'); }, true, async (base) => {
    const r = await req(base, '/google', { idToken: 'bad' });
    assert.equal(r.status, 401);
    assert.match(r.body.error, /could not be verified/);
  });
});

test('FA7. missing idToken is rejected 400', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'fb-a1', email: 'risha@scorecard.com', email_verified: true }), true, async (base) => {
    const r = await req(base, '/google', {});
    assert.equal(r.status, 400);
    assert.match(r.body.error, /idToken is required/);
  });
});

test('FA8. admin google login works when the admin has a connected Gmail account (gmail_authorized syncs)', async () => {
  const db = seededDb();
  db.prepare(`INSERT INTO gmail_connections (user_id, account_email, access_token, refresh_token, scopes, expires_at)
    VALUES (2, 'risha@gmail.com', 'enc', 'rt', 'compose', NULL)`).run();
  await withApi(db, () => ({ uid: 'fb-a1', name: 'Risha', email: 'risha@scorecard.com', email_verified: true, picture: null }), true, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.gmail_authorized, 1);
  });
});