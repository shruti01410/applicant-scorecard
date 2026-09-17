const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

function seededDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT,
      role TEXT NOT NULL, name TEXT NOT NULL, email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      job_description_id INTEGER, resume_text TEXT, capability_match_detail TEXT
    );
    CREATE TABLE parameters (id INTEGER PRIMARY KEY, name TEXT, description TEXT, weightage INTEGER);
    CREATE TABLE scorecards (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL UNIQUE,
      applicant_name TEXT, email TEXT, client TEXT, position TEXT);
    CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
      parameter_id INTEGER NOT NULL, score INTEGER NOT NULL);
    CREATE TABLE job_descriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, client TEXT,
      description_text TEXT);
    CREATE TABLE candidate_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL, jd_id INTEGER, decision TEXT NOT NULL,
      reason_code TEXT, recruiter_feedback TEXT, evidence_snapshot TEXT,
      decided_by INTEGER, decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE candidate_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL, decision_id INTEGER, recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      reviewed_by INTEGER, reviewed_at DATETIME, sent_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (username, password, role, name, email, job_description_id, resume_text, capability_match_detail)
    VALUES ('test123', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com', NULL, NULL, NULL);
    INSERT INTO users (username, password, role, name, email, job_description_id, resume_text, capability_match_detail)
    VALUES ('saikumar', 'x', 'employee', 'Sai Kumar', 'sai@example.com', 1, 'Data scientist with 6+ years doing Python, SQL and ML.', NULL);
    INSERT INTO users (username, password, role, name, email)
    VALUES ('priyasharma', 'x', 'employee', 'Priya Sharma', 'priya@example.com');
    INSERT INTO parameters VALUES (1, 'Technical Skills', 'Depth of relevant technical expertise', 7);
    INSERT INTO job_descriptions (id, title, client, description_text) VALUES (1, 'Data Analyst', 'Suez', 'Requires Python, SQL, Power BI.');
    INSERT INTO scorecards (id, employee_id, applicant_name, email, client, position)
    VALUES (1, 2, 'Sai Kumar', 'sai@example.com', 'Suez', 'Data Analyst');
    INSERT INTO scorecards (id, employee_id, applicant_name, email, client, position)
    VALUES (2, 3, 'Priya Sharma', 'priya@example.com', 'Suez', 'Data Analyst');
    INSERT INTO scores (scorecard_id, parameter_id, score) VALUES (1, 1, 1);
  `);
  return db;
}

async function req(base, path, opts = {}) {
  const headers = { Connection: 'close', ...(opts.headers || {}) };
  return fetch(`${base}${path}`, { ...opts, headers });
}

async function withApi(db, handler) {
  const paths = ['./database', './middleware/auth', './routes/decisions'].map((p) => require.resolve(`../${p.slice(2)}`));
  const cached = paths.map((p) => require.cache[p]);
  let server;
  try {
    require.cache[paths[0]] = { exports: db };
    require.cache[paths[1]] = { exports: { authenticate: (req, res, next) => { req.user = { id: 1, role: 'admin' }; next(); }, requireRole: () => (req, res, next) => next() } };
    delete require.cache[paths[2]];
    const app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/decisions'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/admin`;
    await handler(base);
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    paths.forEach((p, i) => {
      if (cached[i]) require.cache[p] = cached[i];
      else delete require.cache[p];
    });
  }
}

const ADMIN = { id: 1, role: 'admin' };

test('DC1. approving a candidate records the decision and creates an approval email draft', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 3, decision: 'approved', recruiter_feedback: 'Strong culture fit' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.decision.decision, 'approved');
    assert.equal(body.decision.decided_by_name, 'Risha Sinha');
    assert.match(body.email.subject, /Update on Your Application — Suez/);
    assert.match(body.email.body, /next stage of our recruitment process/);
    assert.equal(body.email.status, 'draft');
    assert.equal(body.email.recipient_email, 'priya@example.com');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM candidate_decisions').get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM candidate_emails').get().c, 1);
  });
});

test('DC2. rejecting requires a primary rejection reason', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 2, decision: 'rejected' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /reason/);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM candidate_decisions').get().c, 0);
  });
});

test('DC3. rejecting with a valid reason code records it and creates a rejection draft', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_id: 2, decision: 'rejected', reason_code: 'required_skill_gap',
        recruiter_feedback: 'No Power BI evidence found in resume',
        evidence_snapshot: [{ reason_code: 'required_skill_gap', summary: 'Missing Power BI', evidence: ['Power BI'] }],
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.decision.decision, 'rejected');
    assert.equal(body.decision.reason_code, 'required_skill_gap');
    assert.equal(body.decision.reason_label, 'Required skill gap');
    assert.deepEqual(body.decision.evidence_snapshot, [{ reason_code: 'required_skill_gap', summary: 'Missing Power BI', evidence: ['Power BI'] }]);
    assert.match(body.email.body, /decided not to proceed/);
    assert.equal(body.email.status, 'draft');
  });
});

test('DC4. a new decision replaces stale drafts so email matches the latest decision', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 3, decision: 'approved' }),
    });
    const res = await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 3, decision: 'rejected', reason_code: 'other', recruiter_feedback: 'Role discontinued' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.decision.decision, 'rejected');
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM candidate_emails WHERE status = 'draft'").get().c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM candidate_emails').get().c, 1);
  });
});

test('DC5. editing a draft persists subject/body and marks reviewed', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const created = await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 3, decision: 'approved' }),
    }).then((r) => r.json());
    const res = await req(base, `/decisions/email-drafts/${created.email.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Revised subject', body: 'Revised body — Sai' }),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.subject, 'Revised subject');
    assert.equal(updated.body, 'Revised body — Sai');
    assert.equal(updated.reviewed_by, ADMIN.id);
    const res2 = await req(base, `/decisions/email-drafts/${created.email.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    });
    assert.equal(res2.status, 400);
  });
});

test('DC6. dashboard returns summary counts and latest decision per candidate', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 2, decision: 'approved' }),
    });
    await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 3, decision: 'rejected', reason_code: 'other' }),
    });
    const res = await req(base, '/decisions');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.summary, { approved: 1, rejected: 1, pending: 0 });
    assert.equal(body.candidates.length, 2);
    const approved = body.candidates.find((c) => c.candidate_id === 2);
    assert.equal(approved.applicant_name, 'Sai Kumar');
    assert.equal(approved.latest.decision, 'approved');
    assert.ok(approved.draft && approved.draft.status === 'draft');
  });
});

test('DC7. evidence suggestions come from documented capability-match misses only', async () => {
  const db = seededDb();
  db.prepare('UPDATE users SET capability_match_detail = ? WHERE id = ?').run(
    JSON.stringify({ missing: ['Power BI', 'Spark'] }), 2
  );
  await withApi(db, async (base) => {
    const res = await req(base, '/decisions/evidence/2');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.suggestions));
    const skillGap = body.suggestions.find((s) => s.reason_code === 'required_skill_gap');
    assert.ok(skillGap, 'should include skill-gap suggestion');
    assert.match(skillGap.summary, /Power BI/);
    assert.match(body.disclaimer, /Numerology and astrology are never used/);
    // Candidate without a resume/JD match detail yields no fabricated suggestions.
    const empty = await req(base, '/decisions/evidence/3').then((r) => r.json());
    assert.equal(empty.suggestions.length, 0);
  });
});

test('DC8. email sending is explicitly disabled (drafts-first scope)', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const created = await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 3, decision: 'approved' }),
    }).then((r) => r.json());
    const res = await req(base, `/decisions/email-drafts/${created.email.id}/send`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /disabled/);
    assert.equal(db.prepare('SELECT status FROM candidate_emails WHERE id = ?').get(created.email.id).status, 'draft');
  });
});

test('DC9. unknown rejection reason code is rejected', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 2, decision: 'rejected', reason_code: 'made_up' }),
    });
    assert.equal(res.status, 400);
  });
});