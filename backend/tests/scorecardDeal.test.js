// Regression: DEAL factor ratings must persist and drive Joining Probability.
// Bug fixed here — ScorePage loaded deal factors from sc.scorecard (which never
// carries them) and called .forEach on what is actually an object map, so a
// reload showed "Not scored"; the next save then sent deal_factors: [] and
// wiped the ratings.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const SOP_PARAMS = [
  [101, 'Communication & Influence', 12, 'PERSON'], [102, 'Problem Solving', 14, 'PERSON'],
  [103, 'Judgment & Decision-Making', 12, 'PERSON'], [104, 'Collaboration', 10, 'PERSON'],
  [105, 'Adaptability', 10, 'PERSON'], [106, 'Initiative & Drive', 10, 'PERSON'],
  [107, 'Learning & Growth', 8, 'PERSON'], [108, 'Leadership Potential', 8, 'PERSON'],
  [109, 'Reliability & Professionalism', 8, 'PERSON'], [110, 'Values Alignment', 8, 'PERSON'],
  [111, 'Technical Competence', 50, 'ROLE'], [112, 'Experience Relevance', 30, 'ROLE'],
  [113, 'Qualifications', 20, 'ROLE'],
  [114, 'Motivation & Role Intent', 40, 'DEAL'], [115, 'Availability & Joining', 40, 'DEAL'],
  [116, 'Compensation Alignment', 20, 'DEAL'],
];

const FACTORS = [
  ['active_search', 80], ['career_motive', 70], ['engagement', 65], ['counter_offer', 40],
  ['timeline', 75], ['worklife', 60], ['dropout', 30], ['compensation', 55],
];

function seededDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT,
      role TEXT NOT NULL, name TEXT NOT NULL, email TEXT, date_of_birth TEXT,
      organization_id INTEGER, company_id INTEGER, job_description_id INTEGER,
      resume_text TEXT, resume_file_path TEXT, capability_match_pct REAL, capability_match_detail TEXT, is_archived INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0, deleted_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE parameters (
      id INTEGER PRIMARY KEY, name TEXT, description TEXT, weightage INTEGER,
      grp TEXT, status TEXT DEFAULT 'active'
    );
    CREATE TABLE scorecards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL UNIQUE,
      applicant_name TEXT, email TEXT, client TEXT, position TEXT,
      jd_shared INTEGER DEFAULT 0, jd_shared_date TEXT, remarks TEXT,
      assigned_recruiter_id INTEGER, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
      parameter_id INTEGER NOT NULL, score INTEGER, status TEXT DEFAULT 'active',
      note TEXT, UNIQUE(scorecard_id, parameter_id)
    );
    CREATE TABLE deal_factor_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
      factor_key TEXT NOT NULL, score INTEGER, note TEXT,
      UNIQUE(scorecard_id, factor_key)
    );
    CREATE TABLE scorecard_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'numerology_suggested', 'auto'))
    );
    CREATE TABLE scoring_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL UNIQUE,
      rules_version TEXT, pursuit_priority_raw REAL, pursuit_priority_display INTEGER,
      base_band TEXT, final_decision TEXT, gate_flags TEXT, candidate_fit REAL,
      person_score REAL, role_score REAL, jd_match_score REAL,
      joining_probability REAL, joining_band TEXT, confidence_score REAL,
      confidence_label TEXT, confidence_evidence TEXT, deal_factors TEXT,
      interview_focus TEXT, calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE parameter_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
      parameter_id INTEGER NOT NULL, score REAL,
      confidence REAL NOT NULL DEFAULT 0.5, evidence_items TEXT NOT NULL DEFAULT '[]',
      source TEXT DEFAULT 'auto', reason TEXT, jd_match_pct REAL,
      created_at DATETIME DEFAULT (datetime('now')), UNIQUE(scorecard_id, parameter_id)
    );
    CREATE TABLE must_have_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
      jd_id INTEGER, requirement_text TEXT NOT NULL, met INTEGER NOT NULL DEFAULT 0,
      evidence TEXT, severity TEXT DEFAULT 'critical',
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE job_descriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, client TEXT,
      description_text TEXT, created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE jd_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jd_id INTEGER NOT NULL, keyword TEXT NOT NULL,
      source TEXT, mode TEXT, is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, performed_by INTEGER, user_id INTEGER,
      username TEXT, action TEXT NOT NULL, target_type TEXT, target_id INTEGER,
      module TEXT, detail TEXT, ip TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (1, 'test123', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com');
    INSERT INTO users (id, username, password, role, name, email, capability_match_pct)
    VALUES (2, 'jdoe', 'x', 'employee', 'Jane Doe', 'jane@example.com', 72);
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (3, 'rroy', 'x', 'employee', 'Rahul Roy', 'rahul@example.com');
  `);
  const insParam = db.prepare('INSERT INTO parameters (id, name, weightage, grp, status) VALUES (?, ?, ?, ?, ?)');
  SOP_PARAMS.forEach(([id, name, w, grp]) => insParam.run(id, name, w, grp, 'active'));
  db.prepare(`INSERT INTO scorecards (id, employee_id, applicant_name, email, client, position)
              VALUES (1, 2, 'Jane Doe', 'jane@example.com', 'Suez', 'Data Analyst')`).run();
  db.prepare('INSERT INTO job_descriptions (id, title, client, description_text) VALUES (1, ?, ?, ?)')
    .run('Data Analyst', 'Suez', 'Seeking a Data Analyst with strong Python, SQL and Power BI skills.');
  return db;
}

async function req(base, path, opts = {}) {
  const headers = { Connection: 'close', 'Content-Type': 'application/json', ...(opts.headers || {}) };
  return fetch(`${base}${path}`, { ...opts, headers });
}

const auditCalls = [];

async function withApi(db, handler) {
  const stubPaths = ['./database', './middleware/auth', './audit'].map((p) => require.resolve(`../${p.slice(2)}`));
  const reloadPaths = [
    './routes/admin', './repositories', './scoreUtils', './decisionService',
    './capabilityMatch', './autoRate', './sopAutoRate', './jdValidation',
    './resumeFlags', './resumeIntegrityAnalyzer', './resumeValidation',
    './numerologyUtils', './fileTextExtract',
  ].map((p) => require.resolve(`../${p.slice(2)}`));
  const cached = [...stubPaths, ...reloadPaths].map((p) => [p, require.cache[p]]);
  const currentUser = { id: 1, role: 'admin', username: 'test123' };
  let server;
  try {
    auditCalls.length = 0;
    // routes/admin does `const { makeUsername } = require('../database')` — the
    // database module is stubbed to this db instance, so expose it here too.
    if (typeof db.makeUsername !== 'function') {
      db.makeUsername = (name) => {
        const parts = String(name).trim().toLowerCase().split(/\s+/);
        const base = (parts[0][0] || '') + (parts[parts.length - 1] || '');
        let username = base.replace(/[^a-z0-9]/g, '');
        let counter = 1;
        while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
          username = base.replace(/[^a-z0-9]/g, '') + counter++;
        }
        return username;
      };
    }
    require.cache[stubPaths[0]] = { exports: db };
    require.cache[stubPaths[1]] = {
      exports: {
        authenticate: (r, s, next) => { r.user = { ...currentUser }; next(); },
        requireRole: (role) => (r, s, next) => (r.user && r.user.role === role ? next() : s.status(403).json({ error: 'Forbidden' })),
      },
    };
    require.cache[stubPaths[2]] = { exports: { logAudit: (e) => { auditCalls.push(e); }, clientIp: () => '127.0.0.1' } };
    reloadPaths.forEach((p) => delete require.cache[p]);
    const app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/admin'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/admin`;
    await handler(base);
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    cached.forEach(([p, entry]) => {
      if (entry) require.cache[p] = entry;
      else delete require.cache[p];
    });
  }
}

function payload(db, overrides = {}) {
  const scores = db.prepare(`SELECT parameter_id, score, status FROM scores WHERE scorecard_id = 1`).all();
  return JSON.stringify({
    applicant_name: 'Jane Doe',
    email: 'jane@example.com',
    client: 'Suez',
    position: 'Data Analyst',
    scores,
    ...overrides,
  });
}

test('SD1. DEAL factor ratings persist and drive Joining Probability', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const deal_factors = FACTORS.map(([factor_key, score]) => ({ factor_key, score, note: null }));
    const res = await req(base, '/employees/2/scorecard', { method: 'POST', body: payload(db, { deal_factors }) });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM deal_factor_scores WHERE scorecard_id = 1').get().c, 8);
    assert.ok(body.decision.joining_probability.score != null, 'joining probability computed');
    assert.ok(body.decision.joining_probability.score > 0, 'not a zero/empty score');
    assert.equal(body.decision.joining_probability.deal_factors.length, 8);

    // reload — exactly what ScorePage does when the page opens
    const get = await req(base, '/employees/2/scorecard', { method: 'GET' });
    const reloaded = await get.json();
    assert.equal(reloaded.deal_factors.active_search, 80, 'top-level map carries ratings');
    assert.equal(reloaded.deal_factors.compensation, 55);
    assert.equal(reloaded.decision.joining_probability.score, body.decision.joining_probability.score,
      'joining probability survives a reload');
    // array shape the ScorePage loader reads first
    const arr = reloaded.decision.joining_probability.deal_factors;
    assert.equal(arr.find((f) => f.key === 'active_search').score, 80);
  });
});

test('SD2. POST without a deal_factors key leaves existing ratings untouched', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const rated = FACTORS.map(([factor_key, score]) => ({ factor_key, score, note: null }));
    await req(base, '/employees/2/scorecard', { method: 'POST', body: payload(db, { deal_factors: rated }) });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM deal_factor_scores WHERE scorecard_id = 1').get().c, 8);

    // partial payload: no deal_factors field at all
    const res = await req(base, '/employees/2/scorecard', { method: 'POST', body: payload(db) });
    assert.equal(res.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM deal_factor_scores WHERE scorecard_id = 1').get().c, 8,
      'ratings must not be wiped by a payload that never mentioned them');
    const body = await res.json();
    assert.ok(body.decision.joining_probability.score != null, 'joining probability still computed');
  });
});

test('SD3. an explicit empty array still clears the ratings', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const rated = FACTORS.map(([factor_key, score]) => ({ factor_key, score, note: null }));
    await req(base, '/employees/2/scorecard', { method: 'POST', body: payload(db, { deal_factors: rated }) });
    const res = await req(base, '/employees/2/scorecard', { method: 'POST', body: payload(db, { deal_factors: [] }) });
    assert.equal(res.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM deal_factor_scores WHERE scorecard_id = 1').get().c, 0);
    const body = await res.json();
    assert.equal(body.decision.joining_probability.score, null, 'join is unscored once every factor is cleared');
  });
});

test('SD4. out-of-range and non-numeric factor scores are clamped or rejected safely', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/employees/2/scorecard', {
      method: 'POST',
      body: payload(db, { deal_factors: [{ factor_key: 'active_search', score: 400 }] }),
    });
    assert.equal(res.status, 200);
    assert.equal(db.prepare('SELECT score FROM deal_factor_scores WHERE scorecard_id = 1 AND factor_key = ?').get('active_search').score, 100);
  });
});

// --- Bulk soft-delete (Decision Center multi-select) ---

function employeeFlags(db, ids) {
  const ph = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, is_deleted, is_archived, deleted_at FROM users WHERE role = 'employee' AND id IN (${ph})`
  ).all(...ids);
}

test('BD1. bulk delete soft-deletes every listed employee and writes one bulk audit row', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/employees/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [2, 3] }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, 2);
    assert.equal(body.already_deleted, 0);
    assert.deepEqual(body.ids, [2, 3]);

    const rows = employeeFlags(db, [2, 3]);
    assert.equal(rows.length, 2);
    rows.forEach((r) => {
      assert.equal(r.is_deleted, 1, `employee ${r.id} soft-deleted`);
      assert.equal(r.is_archived, 1, `employee ${r.id} archived`);
      assert.ok(r.deleted_at, `employee ${r.id} stamped`);
    });

    const audits = auditCalls.filter((e) => e.action === 'candidate_deleted');
    assert.equal(audits.length, 1, 'one aggregate audit row, not one per candidate');
    assert.equal(audits[0].targetType, 'bulk');
    assert.equal(audits[0].detail.count, 2);
    assert.deepEqual(audits[0].detail.ids, [2, 3]);
    assert.equal(audits[0].detail.soft, true);

    // reversible: restore clears the flag, same as the single-delete route
    await req(base, '/employees/2/restore', { method: 'POST', body: '{}' });
    assert.equal(employeeFlags(db, [2])[0].is_deleted, 0, 'restore brings the candidate back');
    assert.equal(employeeFlags(db, [3])[0].is_deleted, 1, 'the other stays deleted');
  });
});

test('BD2. admin accounts passed in ids are never deleted', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/employees/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [1, 3] }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, 1, 'only the employee is deleted');
    assert.equal(body.not_found, 1, 'the admin id is reported as not matching');
    assert.deepEqual(body.ids, [3]);
    const admin = db.prepare('SELECT is_deleted FROM users WHERE id = 1').get();
    assert.equal(admin.is_deleted, 0, 'admin row untouched');
    assert.equal(employeeFlags(db, [3])[0].is_deleted, 1);
  });
});

test('BD3. an already-deleted id is skipped instead of double counted', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    db.prepare(`UPDATE users SET is_deleted = 1, deleted_at = datetime('now'), is_archived = 1 WHERE id = 3`).run();
    const res = await req(base, '/employees/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [2, 3] }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, 1);
    assert.equal(body.already_deleted, 1);
    assert.deepEqual(body.ids, [2]);

    // repeat call is a no-op, not an error
    const again = await req(base, '/employees/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [2, 3] }) });
    assert.equal(again.status, 200);
    assert.equal((await again.json()).deleted, 0);
  });
});

test('BD4. empty, non-array and junk ids are rejected with 400', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const bodies = [{}, { ids: [] }, { ids: '2' }, { ids: ['abc', -5, 0, null] }];
    for (const b of bodies) {
      const res = await req(base, '/employees/bulk-delete', { method: 'POST', body: JSON.stringify(b) });
      assert.equal(res.status, 400, `should reject ${JSON.stringify(b)}`);
    }
    // duplicates collapse rather than error
    const dup = await req(base, '/employees/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [2, 2, 2] }) });
    assert.equal(dup.status, 200);
    assert.equal((await dup.json()).deleted, 1);
    assert.equal(employeeFlags(db, [2])[0].is_deleted, 1);
  });
});

// --- Add Candidate must never be blocked by a duplicate ---

function addPayload(overrides = {}) {
  return JSON.stringify({
    name: 'Jane Doe', email: 'jane@example.com', date_of_birth: '1995-04-12',
    position: 'Data Analyst', client: 'Suez', ...overrides,
  });
}

test('AC1. adding a candidate whose name/email already exists still creates them', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const first = await req(base, '/employees', { method: 'POST', body: addPayload() });
    const firstText = await first.clone().text();
    assert.equal(first.status, 201, `first add fails: ${firstText}`);
    const second = await req(base, '/employees', { method: 'POST', body: addPayload() });
    assert.equal(second.status, 201, 'duplicate add must NOT be rejected with 409 Candidate already exists');
    const body = await second.json();
    assert.ok(body.id, 'returns the new candidate id');
    assert.notEqual(body.id, 2, 'a new row, not the pre-existing one');

    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM users WHERE email = ? AND role = ?').get('jane@example.com', 'employee').c, 3,
      'seeded original + two adds'
    );

    const usernames = db.prepare('SELECT username FROM users WHERE name = ?').all('Jane Doe').map((r) => r.username);
    assert.equal(new Set(usernames).size, usernames.length, 'each add gets a unique login');

    // each candidate keeps its OWN scorecard � no cross-wiring onto the original
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM scorecards').get().c, 3);
    assert.equal(db.prepare('SELECT id FROM scorecards WHERE employee_id = 2').get().id, 1,
      'the original candidate still owns scorecard 1');
    const audits = auditCalls.filter((e) => e.action === 'candidate_created');
    assert.equal(audits.length, 2, 'both adds are audited');
  });
});

test('AC2. adding over a soft-deleted candidate also creates a fresh visible row', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    db.prepare(`UPDATE users SET is_deleted = 1, deleted_at = datetime('now'), is_archived = 1 WHERE id = 2`).run();
    const res = await req(base, '/employees', { method: 'POST', body: addPayload() });
    assert.equal(res.status, 201, 'hidden candidate must not block the add');
    const created = await res.json();
    assert.ok(created.id);
    const old = db.prepare('SELECT is_deleted FROM users WHERE id = 2').get();
    assert.equal(old.is_deleted, 1, 'the hidden row stays hidden');
    const visible = db.prepare("SELECT COUNT(*) AS c FROM users WHERE email = ? AND (is_deleted = 0 OR is_deleted IS NULL)").get('jane@example.com').c;
    assert.equal(visible, 1, 'the new row is the one visible in the UI');
  });
});

test('AC3. Add Candidate accepts a missing date of birth so it can be filled in later', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const noDob = await req(base, '/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Dob Yet', email: 'nodob@example.com', position: 'Analyst' }),
    });
    assert.equal(noDob.status, 201, 'a missing DOB must not be rejected');
    const created = await noDob.json();
    assert.equal(db.prepare('SELECT date_of_birth FROM users WHERE id = ?').get(created.id).date_of_birth, null,
      'stored as NULL so the Behavioral Reflection date step can fill it later');

    // malformed + future DOBs are still rejected
    const malformed = await req(base, '/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad Dob', email: 'baddob@example.com', date_of_birth: '1990-13-45' }),
    });
    assert.equal(malformed.status, 400);
    const future = await req(base, '/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'Future Dob', email: 'futuredob@example.com', date_of_birth: '2990-01-01' }),
    });
    assert.equal(future.status, 400);
  });
});

// Regression: sopAutoRateIfMissing() writes scorecard_updates.source = 'auto', which the
// legacy CHECK ('manual','numerology_suggested') rejected — the auto-rate transaction
// rolled back and capability-match/resume-upload returned "CHECK constraint failed".
test('AUTO1. capability-match auto-rate persists a source=auto update instead of failing CHECK', async () => {
  const db = seededDb();
  db.prepare('UPDATE users SET resume_text = ?, job_description_id = ? WHERE id = 2')
    .run('Senior data analyst. Built dashboards in Python, SQL and Power BI for 6 years.', 1);
  await withApi(db, async (base) => {
    const r = await req(base, '/employees/2/capability-match');
    const body = await r.json();
    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${body.error}`);
    assert.equal(body.auto_rated, true, 'hook should auto-rate a scored-less candidate');

    const updates = db.prepare('SELECT source FROM scorecard_updates WHERE scorecard_id = 1 ORDER BY id').all();
    assert.equal(updates.length, 1, 'exactly one update row');
    assert.equal(updates[0].source, 'auto', 'recorded as an auto-rate, not a manual save');

    const scored = db.prepare(`
      SELECT COUNT(*) AS c FROM scores s JOIN parameters p ON p.id = s.parameter_id
      WHERE s.scorecard_id = 1 AND p.grp != 'DEAL' AND s.score IS NOT NULL
    `).get().c;
    assert.ok(scored > 0, 'auto-rated scores must actually persist');
  });
});
