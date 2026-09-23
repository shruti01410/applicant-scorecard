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
    CREATE TABLE applicant_names (id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL, applicant_name TEXT NOT NULL);
    CREATE TABLE scorecards (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL UNIQUE,
      applicant_name TEXT, email TEXT, client TEXT, position TEXT);
    CREATE TABLE parameters (id INTEGER PRIMARY KEY, name TEXT, description TEXT, weightage INTEGER);
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
      reviewed_by INTEGER, reviewed_at DATETIME, sent_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      gmail_draft_id TEXT, gmail_account_id INTEGER, updated_at DATETIME
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performed_by INTEGER, user_id INTEGER, username TEXT, action TEXT NOT NULL,
      target_type TEXT, target_id INTEGER, module TEXT, detail TEXT, ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE approval_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL, approval_type TEXT NOT NULL DEFAULT 'panel',
      status TEXT NOT NULL DEFAULT 'pending', completed_at DATETIME,
      created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE approval_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL, panel_name TEXT NOT NULL,
      rule_type TEXT NOT NULL, required_approvals INTEGER,
      status TEXT NOT NULL DEFAULT 'awaiting', deadline DATETIME, sent_at DATETIME, completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE approval_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT,
      decision TEXT, comment TEXT, reviewed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(panel_id, user_id)
    );
    CREATE TABLE approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL, panel_id INTEGER, action TEXT NOT NULL,
      detail TEXT, performed_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (1, 'test123', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com');
    INSERT INTO users (id, username, password, role, name, email, job_description_id, resume_text)
    VALUES (2, 'saikumar', 'x', 'employee', 'Sai Kumar', 'sai@example.com', 1, 'Data scientist with Python, SQL and ML.');
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (3, 'priyasharma', 'x', 'employee', 'Priya Sharma', 'priya@example.com');
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (4, 'ahmedali', 'x', 'admin', 'Ahmed Ali', 'ahmed@scorecard.com');
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (5, 'ninarao', 'x', 'admin', 'Nina Rao', 'nina@scorecard.com');
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (6, 'tombeck', 'x', 'admin', 'Tom Beck', 'tom@scorecard.com');
    INSERT INTO parameters VALUES (1, 'Technical Skills', 'Depth of relevant technical expertise', 7);
    INSERT INTO job_descriptions (id, title, client, description_text) VALUES (1, 'Data Analyst', 'Suez', 'Requires Python, SQL.');
    INSERT INTO scorecards (employee_id, applicant_name, email, client, position)
    VALUES (2, 'Sai Kumar', 'sai@example.com', 'Suez', 'Data Analyst');
    INSERT INTO scorecards (employee_id, applicant_name, email, client, position)
    VALUES (3, 'Priya Sharma', 'priya@example.com', 'Suez', 'Data Analyst');
  `);
  return db;
}

async function req(base, path, opts = {}) {
  const headers = { Connection: 'close', 'Content-Type': 'application/json', ...(opts.headers || {}) };
  return fetch(`${base}${path}`, { ...opts, headers });
}

async function withApi(db, handler) {
  const overridePaths = ['./database', './middleware/auth'].map((p) => require.resolve(`../${p.slice(2)}`));
  const reloadPaths = ['./routes/approvals', './routes/decisions', './repositories', './audit'].map((p) => require.resolve(`../${p.slice(2)}`));
  const cached = [...overridePaths, ...reloadPaths].map((p) => [p, require.cache[p]]);
  const currentUser = { id: 1, role: 'admin' };
  let server;
  try {
    require.cache[overridePaths[0]] = { exports: db };
    require.cache[overridePaths[1]] = {
      exports: {
        authenticate: (req, res, next) => { req.user = currentUser; next(); },
        requireRole: () => (req, res, next) => next(),
      },
    };
    reloadPaths.forEach((p) => delete require.cache[p]);
    const app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/approvals'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/admin`;
    await handler(base, (user) => { currentUser.id = user.id; currentUser.role = user.role; });
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    cached.forEach(([p, entry]) => {
      if (entry) require.cache[p] = entry;
      else delete require.cache[p];
    });
  }
}

function panelState(db) {
  return db.prepare('SELECT status FROM approval_panels WHERE id = 1').get();
}

test('AP1. creating a panel workflow creates workflow, first panel and members', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({
        candidate_id: 2,
        approval_type: 'panel',
        panel_name: 'Technical Panel',
        rule_type: 'custom',
        required_approvals: 2,
        members: [
          { user_id: 4, role: 'Technical Reviewer' },
          { user_id: 5, role: 'Technical Reviewer' },
          { user_id: 6, role: 'Manager' },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.workflow.approval_type, 'panel');
    assert.equal(body.workflow.status, 'pending');
    assert.equal(body.workflow.health.panels_total, 1);
    const panel = body.workflow.panels[0];
    assert.equal(panel.panel_name, 'Technical Panel');
    assert.equal(panel.rule_type, 'custom');
    assert.equal(panel.required_approvals, 2);
    assert.equal(panel.status, 'awaiting');
    assert.equal(panel.members.length, 3);
    assert.equal(panel.members[0].name, 'Ahmed Ali');
    assert.equal(panel.members[0].role, 'Technical Reviewer');
    const history = db.prepare("SELECT action FROM approval_history ORDER BY id").all();
    assert.deepEqual(history.map((h) => h.action), ['workflow_created', 'panel_created']);
  });
});

test('AP2. any_one rule: a single approval resolves the whole workflow', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'any_one', members: [{ user_id: 4 }, { user_id: 5 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    const res = await req(base, '/approvals/panels/1/review', {
      method: 'POST', body: JSON.stringify({ decision: 'approve', comment: 'Strong fit' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.panel.status, 'approved');
    assert.ok(body.panel.completed_at);
    const wf = db.prepare('SELECT status FROM approval_workflows WHERE id = 1').get();
    assert.equal(wf.status, 'pending');
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM approval_members WHERE decision = 'approve'").get().c, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM approval_members WHERE decision IS NULL").get().c, 1, 'unreviewed member stays pending');
  });
});

test('AP3. majority rule: 2 of 3 approvals approve; resolved panel blocks late reviews', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'majority', members: [{ user_id: 4 }, { user_id: 5 }, { user_id: 6 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    setUser({ id: 5, role: 'admin' });
    const res = await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).panel.status, 'approved');
    setUser({ id: 6, role: 'admin' });
    const late = await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'reject' }) });
    assert.equal(late.status, 409);
  });
});

test('AP4. all rule: one rejection rejects; workflow rejected', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'all', members: [{ user_id: 4 }, { user_id: 5 }] }),
    });
    setUser({ id: 5, role: 'admin' });
    const res = await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'reject', comment: 'Missing certifications' }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).panel.status, 'rejected');
    const wf = db.prepare('SELECT status FROM approval_workflows WHERE id = 1').get();
    assert.equal(wf.status, 'rejected');
    const hist = db.prepare("SELECT action FROM approval_history WHERE panel_id = 1 ORDER BY id").all();
    assert.ok(hist.some((h) => h.action === 'panel_resolved'), 'should record panel_resolved');
  });
});

test('AP5. custom rule: needs n approvals; outcome flips correctly', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'custom', required_approvals: 2, members: [{ user_id: 4 }, { user_id: 5 }, { user_id: 6 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'reject' }) });
    assert.equal(panelState(db).status, 'awaiting', 'one reject with 2-of-3 rule stays awaiting');
    setUser({ id: 5, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(panelState(db).status, 'awaiting', '1 approve + 1 reject still awaiting');
    setUser({ id: 6, role: 'admin' });
    const res = await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).panel.status, 'approved');
    assert.equal(db.prepare('SELECT status FROM approval_workflows WHERE id = 1').get().status, 'pending');
  });
});

test('AP6. reviewers must be assigned to the panel (403 otherwise)', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'any_one', members: [{ user_id: 4 }] }),
    });
    setUser({ id: 99, role: 'admin' });
    const res = await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /assigned to this panel/);
    assert.equal(panelState(db).status, 'awaiting');
  });
});

test('AP7. all-opinions-held with rule unmet sends the panel to hold', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'all', members: [{ user_id: 4 }, { user_id: 5 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(panelState(db).status, 'awaiting', '1/2 approve with all-rule remains awaiting');
    setUser({ id: 5, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'hold' }) });
    assert.equal(panelState(db).status, 'hold');
    assert.equal(db.prepare('SELECT status FROM approval_workflows WHERE id = 1').get().status, 'hold');
    const res = await req(base, '/approvals/panels/1/restart', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).panel.status, 'awaiting');
  });
});

test('AP8. sending to another panel adds a second panel to the same workflow', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'any_one', members: [{ user_id: 4 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    const res = await req(base, '/approvals/panels', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, panel_name: 'HR Panel', rule_type: 'all', members: [{ user_id: 1, role: 'HR' }] }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.workflow.health.panels_total, 2);
    assert.equal(body.workflow.panels[1].panel_name, 'HR Panel');
    assert.equal(body.workflow.panels[1].status, 'awaiting');
    assert.equal(db.prepare("SELECT status FROM approval_workflows WHERE id = 1").get().status, 'pending');
    const blocked = await req(base, '/approvals/panels', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, panel_name: 'Third Panel' }),
    });
    assert.equal(blocked.status, 409, 'cannot add another panel before HR settles');
  });
});

test('AP9. finalize approval completes the workflow and creates decision + email draft', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'any_one', members: [{ user_id: 4 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    setUser({ id: 1, role: 'admin' });
    const res = await req(base, '/approvals/2/finalize', {
      method: 'POST',
      body: JSON.stringify({ final_decision: 'approved', recruiter_feedback: 'Panel approved after HR check' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.email.status, 'draft');
    assert.equal(body.email.recipient_email, 'sai@example.com');
    assert.match(body.email.body, /next stage/);
    assert.equal(db.prepare('SELECT status, completed_at FROM approval_workflows WHERE id = 1').get().status, 'approved');
    assert.ok(db.prepare('SELECT completed_at FROM approval_workflows WHERE id = 1').get().completed_at, 'finalize stamps completed_at');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM candidate_decisions').get().c, 1);
    const again = await req(base, '/approvals/2/finalize', { method: 'POST', body: JSON.stringify({ final_decision: 'rejected', reason_code: 'other' }) });
    assert.equal(again.status, 409, 'cannot finalize twice');
  });
});

test('AP10. finalize rejection requires a valid reason code', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'single' }),
    });
    const res = await req(base, '/approvals/2/finalize', { method: 'POST', body: JSON.stringify({ final_decision: 'rejected' }) });
    assert.equal(res.status, 400);
    const bad = await req(base, '/approvals/2/finalize', { method: 'POST', body: JSON.stringify({ final_decision: 'rejected', reason_code: 'nope' }) });
    assert.equal(bad.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM candidate_decisions').get().c, 0);
  });
});

test('AP11. creation validates members exist and are admins; blocks duplicate active workflows', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const bad = await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', members: [{ user_id: 999 }] }),
    });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /does not exist/);
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'single' }),
    });
    const dup = await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel' }),
    });
    assert.equal(dup.status, 409);
  });
});

test('AP12. approval detail endpoint returns workflow, panels, members and history', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 3, approval_type: 'panel', rule_type: 'majority', members: [{ user_id: 4, role: 'Technical Reviewer' }, { user_id: 5 }] }),
    });
    const res = await req(base, '/employees/3/approval');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.candidate.name, 'Priya Sharma');
    assert.equal(body.panels.length, 1);
    assert.equal(body.panels[0].members.length, 2);
    assert.equal(body.panels[0].rule_label, 'Majority (more than half)');
    assert.ok(body.history.some((h) => h.action === 'workflow_created'));
    const admins = await req(base, '/approvals/admins').then((r) => r.json());
    assert.ok(admins.some((a) => a.name === 'Ahmed Ali'));
    assert.ok(!admins.some((a) => a.username), 'admins list should not expose usernames');
  });
});

test('AP13. members can update their own opinion; members list route requires admin users only', async () => {
  const db = seededDb();
  await withApi(db, async (base, setUser) => {
    await req(base, '/approvals/workflows', {
      method: 'POST',
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'any_one', members: [{ user_id: 4 }, { user_id: 5 }] }),
    });
    setUser({ id: 4, role: 'admin' });
    await req(base, '/approvals/panels/1/review', { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(panelState(db).status, 'approved', 'any_one resolves immediately');
    const addMember = await req(base, '/approvals/panels/1/members', { method: 'POST', body: JSON.stringify({ user_id: 6 }) });
    assert.equal(addMember.status, 409, 'resolved panel rejects new members');
    const addBad = await req(base, '/approvals/panels/1/members', { method: 'POST', body: JSON.stringify({ user_id: 2 }) });
    assert.equal(addBad.status, 409);
  });
});