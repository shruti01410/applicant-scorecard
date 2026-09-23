const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const gmail = require('../gmailService');

function seededDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT,
      role TEXT NOT NULL, name TEXT NOT NULL, email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      job_description_id INTEGER, resume_text TEXT, capability_match_detail TEXT
    );
    CREATE TABLE candidate_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL, jd_id INTEGER, decision TEXT NOT NULL,
      reason_code TEXT, recruiter_feedback TEXT, evidence_snapshot TEXT,
      decided_by INTEGER, decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE candidate_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL, decision_id INTEGER, recipient_email TEXT,
      subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      reviewed_by INTEGER, reviewed_at DATETIME, sent_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      gmail_draft_id TEXT, gmail_account_id INTEGER, updated_at DATETIME
    );
    CREATE TABLE gmail_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE, account_email TEXT NOT NULL,
      access_token TEXT NOT NULL, refresh_token TEXT, scopes TEXT NOT NULL DEFAULT '',
      expires_at TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    VALUES ('test123', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com');
    INSERT INTO users (username, password, role, name, email)
    VALUES ('saikumar', 'x', 'employee', 'Sai Kumar', 'sai@example.com');
  `);
  return db;
}

function installFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1') || (!u.includes('googleapis.com') && !u.includes('accounts.google.com'))) {
      return original(u, opts);
    }
    const result = handler(u, opts);
    if (result instanceof Response) return result;
    const status = result && result.status ? result.status : 200;
    const body = result && result.raw ? result.raw : result;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return () => { globalThis.fetch = original; };
}

function googleHandler(tracker) {
  return (url, opts) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const grant = opts.body.includes('grant_type=refresh_token') ? 'refresh' : 'auth';
      tracker.tokenCalls.push({ grant, at: (opts.headers || {}).Authorization });
      return { access_token: 'at_' + (grant === 'refresh' ? 'r' : 'e'), refresh_token: grant === 'auth' ? 'rt_e' : undefined, expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.compose' };
    }
    if (url.endsWith('/profile')) {
      return { emailAddress: 'recruiter@gmail.com' };
    }
    if (url.endsWith('/drafts') && method === 'POST') {
      tracker.draftCalls.push({ at: (opts.headers || {}).Authorization, body: JSON.parse(opts.body) });
      return { id: 'draft_123', message: { id: 'msg_456', threadId: 'thr_1' } };
    }
    return { status: 500, raw: '{"error":"unmocked"}' };
  };
}

async function req(base, path, opts = {}) {
  const headers = { Connection: 'close', ...(opts.headers || {}) };
  return fetch(`${base}${path}`, { ...opts, headers });
}

async function withApi(db, handler) {
  const dbPath = require.resolve('../database');
  const authPath = require.resolve('../middleware/auth');
  const gmailRoutesPath = require.resolve('../routes/gmail');
  const gmailServicePath = require.resolve('../gmailService');
  const saved = new Map();
  for (const p of [dbPath, authPath, gmailRoutesPath, gmailServicePath]) saved.set(p, require.cache[p]);
  let server;
  try {
    require.cache[dbPath] = { exports: db };
    require.cache[authPath] = {
      exports: {
        authenticate: (req2, res, next) => { req2.user = { id: 1, role: 'admin' }; next(); },
        requireRole: () => (req2, res, next) => next(),
      },
    };
    delete require.cache[gmailRoutesPath];
    delete require.cache[gmailServicePath];
    const app = express();
    app.use(express.json());
    app.use('/api/admin/gmail', require('../routes/gmail'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/admin/gmail`;
    await handler(base);
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const [p, cached] of saved) {
      if (cached) require.cache[p] = cached;
      else delete require.cache[p];
    }
    process.env.GMAIL_CLIENT_ID = '';
    process.env.GMAIL_CLIENT_SECRET = '';
  }
}

function makeDraft(db, overrides = {}) {
  db.prepare(`INSERT INTO candidate_emails (candidate_id, decision_id, recipient_email, subject, body, status)
    VALUES (?, ?, ?, ?, ?, 'draft')`).run(
    2, 1, overrides.recipient_email != null ? overrides.recipient_email : 'sai@example.com',
    overrides.subject != null ? overrides.subject : 'Update on Your Application',
    overrides.body != null ? overrides.body : 'Dear Sai,\n\nYou have been selected.\n'
  );
  return db.prepare('SELECT * FROM candidate_emails WHERE id = last_insert_rowid()').get();
}

// ---------- Pure function unit tests ----------
test('G1. MIME message round-trips through base64url and carries To/From/Subject/Body', () => {
  const msg = gmail.buildMimeMessage({ to: 'sai@example.com', from: 'recruiter@gmail.com', subject: 'Next steps', body: 'Line one\nLine two' });
  assert.match(msg, /^To: sai@example.com/);
  assert.match(msg, /^From: recruiter@gmail.com/m);
  assert.match(msg, /^Subject: Next steps$/m);
  assert.match(msg, /Line one\r?\nLine two/);
  const encoded = gmail.toBase64Url(msg);
  assert.equal(typeof encoded, 'string');
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.ok(encoded.length > 20);
  assert.equal(gmail.fromBase64Url(encoded), msg);
});

test('G2. non-ASCII subject is RFC2047 encoded, plain ASCII subject preserved', () => {
  assert.equal(gmail.encodeRFC2047('Update on Your Application'), 'Update on Your Application');
  assert.match(gmail.encodeRFC2047('Update — निमंत्रण'), /^=\?UTF-8\?B\?/);
});

test('G3. email validation, token encryption, and OAuth state signing', () => {
  assert.ok(gmail.isValidEmail('sai@example.com'));
  assert.ok(!gmail.isValidEmail('not-an-email'));
  assert.ok(!gmail.isValidEmail(''));
  const enc = gmail.encryptToken('secret-token-xyz');
  assert.notEqual(enc, 'secret-token-xyz');
  assert.ok(String(enc).startsWith('v1:'));
  assert.equal(gmail.decryptToken(enc), 'secret-token-xyz');
  const tampered = enc.slice(0, -3) + (enc.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal(gmail.decryptToken(tampered), null);
  const state = gmail.signState({ uid: 1, ts: Date.now(), returnTo: '/decision-center' });
  const payload = gmail.verifyState(state);
  assert.equal(payload.uid, 1);
  assert.equal(payload.returnTo, '/decision-center');
  assert.equal(gmail.verifyState('garbage.state'), null);
});

// ---------- API tests ----------
test('G4. connect returns a Google auth URL with the compose scope when configured', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/connect?return_to=/decision-center');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
    assert.ok(body.authUrl.includes(encodeURIComponent('https://www.googleapis.com/auth/gmail.compose')));
    assert.ok(body.authUrl.includes('access_type=offline'));
    assert.ok(body.authUrl.includes('prompt=consent'));
    assert.ok(body.authUrl.includes('state='));
    assert.ok(body.authUrl.includes('redirect_uri='));
  });
});

test('G5. connect is blocked with a friendly message when OAuth is not configured', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/connect');
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /GMAIL_CLIENT_ID/);
  });
});

test('G6. status reports connection state and configured flag', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/status');
    const body = await res.json();
    assert.equal(body.connected, false);
    assert.equal(body.configured, true);
    require('../gmailService').storeConnection({ userId: 1, accountEmail: 'recruiter@gmail.com', accessToken: 'at', refreshToken: 'rt', cfg: gmail.getConfig() });
    const res2 = await req(base, '/status');
    const body2 = await res2.json();
    assert.equal(body2.connected, true);
    assert.equal(body2.account, 'recruiter@gmail.com');
  });
});

test('G7. creating a Gmail draft uses the candidate email, never the recruiter email', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const tracker = { tokenCalls: [], draftCalls: [] };
  const restore = installFetch(googleHandler(tracker));
  const db = seededDb();
  const draft = makeDraft(db);
  try {
    await withApi(db, async (base) => {
      require('../gmailService').storeConnection({ userId: 1, accountEmail: 'recruiter@gmail.com', accessToken: 'at_e', refreshToken: 'rt_e', cfg: gmail.getConfig() });
      const res = await req(base, `/email-drafts/${draft.id}/gmail`, { method: 'POST' });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.gmail_draft_id, 'draft_123');
      assert.equal(body.to, 'sai@example.com');
      assert.equal(body.gmail_account, 'recruiter@gmail.com');
      assert.ok(body.gmail_draft_url.includes('mail.google.com'));
      const decoded = gmail.fromBase64Url(tracker.draftCalls[0].body.message.raw);
      assert.match(decoded, new RegExp(`^To: sai@example.com`));
      assert.match(decoded, /^From: recruiter@gmail.com/m);
      const row = db.prepare('SELECT gmail_draft_id, gmail_account_id FROM candidate_emails WHERE id = ?').get(draft.id);
      assert.equal(row.gmail_draft_id, 'draft_123');
      assert.ok(row.gmail_account_id);
    });
  } finally {
    restore();
  }
});

test('G8. a draft already saved to Gmail refuses duplicates', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const tracker = { tokenCalls: [], draftCalls: [] };
  const restore = installFetch(googleHandler(tracker));
  const db = seededDb();
  const draft = makeDraft(db);
  try {
    await withApi(db, async (base) => {
      require('../gmailService').storeConnection({ userId: 1, accountEmail: 'recruiter@gmail.com', accessToken: 'at_e', refreshToken: 'rt_e', cfg: gmail.getConfig() });
      const res1 = await req(base, `/email-drafts/${draft.id}/gmail`, { method: 'POST' });
      assert.equal(res1.status, 201);
      const res2 = await req(base, `/email-drafts/${draft.id}/gmail`, { method: 'POST' });
      assert.equal(res2.status, 409);
      const body2 = await res2.json();
      assert.match(body2.error, /already saved to Gmail/);
      assert.equal(tracker.draftCalls.length, 1);
    });
  } finally {
    restore();
  }
});

test('G9. missing or invalid candidate email is rejected before any Gmail call', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const tracker = { tokenCalls: [], draftCalls: [] };
  const restore = installFetch(googleHandler(tracker));
  const db = seededDb();
  try {
    await withApi(db, async (base) => {
      require('../gmailService').storeConnection({ userId: 1, accountEmail: 'recruiter@gmail.com', accessToken: 'at_e', refreshToken: 'rt_e', cfg: gmail.getConfig() });
      db.prepare("UPDATE users SET email = '' WHERE id = 2").run();
      const missing = makeDraft(db, { recipient_email: '' });
      const res = await req(base, `/email-drafts/${missing.id}/gmail`, { method: 'POST' });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /email is unavailable/i);
      const bad = makeDraft(db, { recipient_email: 'not-an-email' });
      const res2 = await req(base, `/email-drafts/${bad.id}/gmail`, { method: 'POST' });
      assert.equal(res2.status, 400);
      assert.match((await res2.json()).error, /not valid/i);
      assert.equal(tracker.draftCalls.length, 0);
      assert.equal(tracker.tokenCalls.length, 0);
    });
  } finally {
    restore();
  }
});

test('G10. creating a Gmail draft requires a connected account', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const db = seededDb();
  const draft = makeDraft(db);
  await withApi(db, async (base) => {
    const res = await req(base, `/email-drafts/${draft.id}/gmail`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /not connected/i);
  });
});

test('G11. expired access tokens are refreshed, then the draft is created', async () => {
  process.env.GMAIL_CLIENT_ID = 'cid';
  process.env.GMAIL_CLIENT_SECRET = 'csecret';
  const tracker = { tokenCalls: [], draftCalls: [] };
  const restore = installFetch(googleHandler(tracker));
  const db = seededDb();
  const draft = makeDraft(db);
  try {
    await withApi(db, async (base) => {
      require('../gmailService').storeConnection({
        userId: 1, accountEmail: 'recruiter@gmail.com',
        accessToken: 'at_e', refreshToken: 'rt_e',
        expiresAt: new Date(Date.now() - 60000).toISOString(), cfg: gmail.getConfig(),
      });
      const res = await req(base, `/email-drafts/${draft.id}/gmail`, { method: 'POST' });
      assert.equal(res.status, 201);
      assert.equal(tracker.tokenCalls.length, 1);
      assert.equal(tracker.tokenCalls[0].grant, 'refresh');
      assert.equal(tracker.draftCalls[0].at, 'Bearer at_r');
    });
  } finally {
    restore();
  }
});

test('G13. the OAuth callback stays public even though /api/admin routers run JWT auth', async () => {
  const db = seededDb();
  const dbPath = require.resolve('../database');
  const authPath = require.resolve('../middleware/auth');
  const gmailRoutesPath = require.resolve('../routes/gmail');
  const gmailServicePath = require.resolve('../gmailService');
  const saved = new Map();
  for (const p of [dbPath, authPath, gmailRoutesPath, gmailServicePath]) saved.set(p, require.cache[p]);
  let server;
  try {
    require.cache[dbPath] = { exports: db };
    require.cache[authPath] = {
      exports: {
        authenticate: (req2, res, next) => res.status(401).json({ error: 'Authentication required' }),
        requireRole: () => (req2, res, next) => next(),
      },
    };
    delete require.cache[gmailRoutesPath];
    delete require.cache[gmailServicePath];
    const app = express();
    app.use(express.json());
    // mirror server.js: the public gmail router MUST be mounted before the
    // JWT-guarded /api/admin routers, or Google's tokenless redirect hits 401.
    app.use('/api/admin/gmail', require('../routes/gmail'));
    const guarded = express.Router();
    guarded.use(require('../middleware/auth').authenticate);
    guarded.get('/anything', (req2, res) => res.json({}));
    app.use('/api/admin', guarded);
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/gmail/oauth/callback?state=bad&code=x`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') || '', /gmail=invalid_state/);
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const [p, cached] of saved) {
      if (cached) require.cache[p] = cached;
      else delete require.cache[p];
    }
  }
});
  test('G12. disconnect removes the connection, and blocked-with-503 when unconfigured', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    require('../gmailService').storeConnection({ userId: 1, accountEmail: 'recruiter@gmail.com', accessToken: 'at', refreshToken: 'rt' });
    const res = await req(base, '/disconnect', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).connected, false);
    assert.equal(require('../gmailService').getConnection(1), undefined);

    const draft = makeDraft(db);
    const res2 = await req(base, `/email-drafts/${draft.id}/gmail`, { method: 'POST' });
    assert.equal(res2.status, 400);
    assert.match((await res2.json()).error, /not connected/i);
  });
});