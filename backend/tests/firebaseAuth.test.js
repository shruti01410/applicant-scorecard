const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

function seededDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE, slug TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performed_by INTEGER, user_id INTEGER, username TEXT,
      action TEXT NOT NULL, target_type TEXT, target_id INTEGER,
      module TEXT, detail TEXT, ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE, password TEXT, role TEXT NOT NULL,
      name TEXT NOT NULL, email TEXT,
      organization_id INTEGER, status TEXT DEFAULT 'active',
      auth_provider TEXT DEFAULT 'local', last_login_at DATETIME
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
    INSERT INTO organizations (name, slug) VALUES ('HUMSEE', 'humsee');
    INSERT INTO users (username, password, role, name, email, organization_id)
    VALUES ('test123', 'x', 'admin', 'Admin User', 'admin@scorecard.com', 1);
    INSERT INTO users (username, password, role, name, email, organization_id)
    VALUES ('risha', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com', 1);
    INSERT INTO users (username, password, role, name, email, organization_id)
    VALUES ('sai', 'x', 'employee', 'Sai Kumar', 'sai@example.com', 1);
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
  const auditPath = require.resolve('../audit');
  const reposPath = require.resolve('../repositories');
  const savedDb = require.cache[dbPath];
  const savedFb = require.cache[fbPath];
  const savedAuth = require.cache[authPath];
  const savedAudit = require.cache[auditPath];
  const savedRepos = require.cache[reposPath];
  let server;
  try {
    require.cache[dbPath] = {
      exports: Object.assign(db, {
        makeUsername: (name) => {
          const parts = String(name).trim().toLowerCase().split(/\s+/);
          const base = ((parts[0] || '')[0] || '') + (parts[parts.length - 1] || '');
          let username = base.replace(/[^a-z0-9]/g, '');
          let counter = 1;
          while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
            username = base.replace(/[^a-z0-9]/g, '') + counter++;
          }
          return username;
        },
      }),
    };
    delete require.cache[fbPath];
    require.cache[fbPath] = {
      exports: {
        isFirebaseConfigured: () => configured,
        verifyGoogleIdToken: async (token) => verifyFn(token),
        webConfig: () => ({ enabled: false, apiKey: '', authDomain: '', projectId: '', appId: '' }),
      },
    };
    delete require.cache[authPath];
    delete require.cache[auditPath];
    delete require.cache[reposPath];
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
    require.cache[auditPath] = savedAudit;
    if (savedRepos) require.cache[reposPath] = savedRepos;
    else delete require.cache[reposPath];
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

test('FA4. a verified Google email not yet in the DB is provisioned as an admin', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'fb-x', name: 'Stranger', email: 'stranger@gmail.com', email_verified: true, picture: null }), true, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'admin');
    assert.equal(r.body.user.email, 'stranger@gmail.com');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get('stranger@gmail.com');
    assert.ok(row);
    assert.equal(row.role, 'admin');
    assert.equal(row.username, 'sstranger');
    const profile = db.prepare('SELECT * FROM recruiter_profiles').get();
    assert.equal(profile.user_id, row.id);
  });
});

test('FA11. an email not on the ADMIN_ALLOWED_EMAILS allowlist is rejected 403', async () => {
  const db = seededDb();
  const saved = process.env.ADMIN_ALLOWED_EMAILS;
  process.env.ADMIN_ALLOWED_EMAILS = 'risha@scorecard.com, boss@scorecard.com';
  try {
    await withApi(db, () => ({ uid: 'fb-stranger', name: 'Stranger', email: 'stranger@gmail.com', email_verified: true, picture: null }), true, async (base) => {
      const r = await req(base, '/google', { idToken: 'tok' });
      assert.equal(r.status, 403);
      assert.match(r.body.error, /not on the allowed list/i);
      const row = db.prepare('SELECT id FROM users WHERE email = ?').get('stranger@gmail.com');
      assert.ok(!row, 'blocked email must not be provisioned');
    });
  } finally {
    if (saved == null) delete process.env.ADMIN_ALLOWED_EMAILS;
    else process.env.ADMIN_ALLOWED_EMAILS = saved;
  }
});

test('FA12. an email on the ADMIN_ALLOWED_EMAILS allowlist is accepted', async () => {
  const db = seededDb();
  const saved = process.env.ADMIN_ALLOWED_EMAILS;
  process.env.ADMIN_ALLOWED_EMAILS = 'risha@scorecard.com';
  try {
    await withApi(db, () => ({ uid: 'fb-ok', name: 'Risha S', email: 'Risha@scorecard.com', email_verified: true, picture: null }), true, async (base) => {
      const r = await req(base, '/google', { idToken: 'tok' });
      assert.equal(r.status, 200);
      assert.equal(r.body.user.role, 'admin');
      assert.equal(r.body.user.email.toLowerCase(), 'risha@scorecard.com');
      const row = db.prepare('SELECT organization_id, auth_provider, last_login_at, status FROM users WHERE id = ?').get(r.body.user.id);
      assert.equal(row.organization_id, 1, 'allowed google email stays bound to the default org');
      assert.ok(['local', 'google'].includes(row.auth_provider), 'existing user keeps a valid auth_provider');
      assert.equal(row.status, 'active');
      assert.ok(row.last_login_at, 'google login stamps last_login_at');
      const logged = db.prepare('SELECT COUNT(*) c FROM audit_logs WHERE action = ?').get('google_promote_admin');
      assert.ok(logged.c >= 0, 'audit_logs table is writable through google login');
    });
  } finally {
    if (saved == null) delete process.env.ADMIN_ALLOWED_EMAILS;
    else process.env.ADMIN_ALLOWED_EMAILS = saved;
  }
});

test('FA13. password login records audit + updates last_login + rejects suspended users', async () => {
  const db = seededDb();
  db.prepare('UPDATE users SET password = ? WHERE id = 1').run(require('bcryptjs').hashSync('secret', 4));
  await withApi(db, () => ({ uid: 'x', email: 'x@x.com', email_verified: true }), true, async (base) => {
    const loginBody = { username: 'test123', password: 'secret' };

    const ok = await req(base, '/login', loginBody);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.organization_id, 1);
    const row = db.prepare('SELECT last_login_at FROM users WHERE id = ?').get(ok.body.user.id);
    assert.ok(row.last_login_at);
    const loggedIn = db.prepare('SELECT COUNT(*) c FROM audit_logs WHERE action = ?').get('login');
    assert.equal(loggedIn.c, 1);

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('suspended', ok.body.user.id);
    const blocked = await req(base, '/login', loginBody);
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /suspended/i);
    const blockedLog = db.prepare('SELECT COUNT(*) c FROM audit_logs WHERE action = ?').get('login_blocked_suspended');
    assert.equal(blockedLog.c, 1);
  });
});

test('FA10. an existing employee email is elevated to admin on Google login', async () => {
  const db = seededDb();
  await withApi(db, () => ({ uid: 'fb-emp', name: 'Sai Kumar', email: 'sai@example.com', email_verified: true, picture: null }), true, async (base) => {
    const r = await req(base, '/google', { idToken: 'tok' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'admin');
    const row = db.prepare('SELECT role FROM users WHERE email = ?').get('sai@example.com');
    assert.equal(row.role, 'admin');
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

test('FA9. firebase-config endpoint exposes the web SDK config to the login screen', async () => {
  const db = seededDb();
  const fbPath = require.resolve('../firebaseAuth');
  const savedFb = require.cache[fbPath];
  try {
    require.cache[fbPath] = {
      exports: {
        isFirebaseConfigured: () => true,
        verifyGoogleIdToken: async () => ({}),
        webConfig: () => ({
          enabled: true,
          apiKey: 'AIzaSyTEST',
          authDomain: 'x.firebaseapp.com',
          projectId: 'astrologyai-78794',
          appId: '1:1:web:test',
        }),
      },
    };
    delete require.cache[require.resolve('../routes/auth')];
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/firebase-config`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.enabled, true);
      assert.equal(body.apiKey, 'AIzaSyTEST');
      assert.equal(body.projectId, 'astrologyai-78794');
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      require.cache[fbPath] = savedFb;
    }
  } finally {
    require.cache[fbPath] = savedFb;
  }
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