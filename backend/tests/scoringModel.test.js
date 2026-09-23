const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const scoreUtils = require('../scoreUtils');
const decisionService = require('../decisionService');

// ---- SOP 16-parameter fixture (mirrors database.js seed) ----
const PARAMS = [
  { id: 101, name: 'Communication & Influence', weightage: 12, grp: 'PERSON' },
  { id: 102, name: 'Problem Solving & Analytical Thinking', weightage: 14, grp: 'PERSON' },
  { id: 103, name: 'Judgment & Decision-Making', weightage: 12, grp: 'PERSON' },
  { id: 104, name: 'Collaboration & Teamwork', weightage: 10, grp: 'PERSON' },
  { id: 105, name: 'Adaptability, Agility & Resilience', weightage: 10, grp: 'PERSON' },
  { id: 106, name: 'Initiative & Drive', weightage: 10, grp: 'PERSON' },
  { id: 107, name: 'Learning & Growth Orientation', weightage: 8, grp: 'PERSON' },
  { id: 108, name: 'Leadership Potential', weightage: 8, grp: 'PERSON' },
  { id: 109, name: 'Reliability & Professionalism', weightage: 8, grp: 'PERSON' },
  { id: 110, name: 'Values & Work-Environment Alignment', weightage: 8, grp: 'PERSON' },
  { id: 111, name: 'Technical / Role Competence', weightage: 50, grp: 'ROLE' },
  { id: 112, name: 'Experience & Industry Relevance', weightage: 30, grp: 'ROLE' },
  { id: 113, name: 'Qualifications & Certifications', weightage: 20, grp: 'ROLE' },
  { id: 114, name: 'Motivation & Role Intent', weightage: 40, grp: 'DEAL' },
  { id: 115, name: 'Availability & Joining Readiness', weightage: 40, grp: 'DEAL' },
  { id: 116, name: 'Compensation Alignment', weightage: 20, grp: 'DEAL' },
];

const FACTOR_KEYS = ['active_search', 'career_motive', 'engagement', 'counter_offer', 'timeline', 'worklife', 'dropout', 'compensation'];

function makeRows(person, role, deal, overrides = {}) {
  const rows = {};
  PARAMS.forEach(p => {
    rows[p.id] = { score: p.grp === 'PERSON' ? person : p.grp === 'ROLE' ? role : deal, status: 'active', name: p.name };
  });
  Object.keys(overrides).forEach(id => Object.assign(rows[id], overrides[id]));
  return rows;
}

function makeFactors(score) {
  const f = {};
  FACTOR_KEYS.forEach(k => { f[k] = score; });
  return f;
}

const EV_FULL = { jdAvailable: true, resumeAvailable: true, mandatoryResolved: true, scoredAtLeast80Pct: true, recruiterEvidence: true, references: true };

function decide(overrides = {}) {
  return scoreUtils.computeDecision({
    params: PARAMS,
    rowScores: overrides.rowScores || makeRows(76, 82, 68),
    dealFactorScores: overrides.dealFactorScores || makeFactors(68),
    jdMatchPct: overrides.jdMatchPct != null ? overrides.jdMatchPct : 55,
    missingReq: overrides.missingReq || [],
    evidence: overrides.evidence || EV_FULL,
    behavioralSignals: overrides.behavioralSignals || [],
  });
}

// ---- SOP §14 minimum developer test cases ----
test('SOP-P1 Standard: P76 R82 JD55; Join 68', () => {
  const d = decide();
  assert.equal(d.candidate_fit.score, 73.2);
  assert.equal(d.pursuit_priority.display_score, 71);
  assert.equal(d.pursuit_priority.final_decision, 'INTERVIEW');
  assert.equal(d.candidate_fit.person_score, 76);
  assert.equal(d.candidate_fit.role_score, 82);
  assert.equal(d.candidate_fit.jd_match_score, 55);
  assert.equal(d.joining_probability.score, 68);
});

test('SOP-P2 Role gate: ROLE < 50 caps at VERIFY BEFORE INTERVIEW; raw retained', () => {
  const d = decide({ rowScores: makeRows(81, 45, 68) });
  assert.equal(d.pursuit_priority.final_decision, 'VERIFY BEFORE INTERVIEW');
  assert.ok(d.pursuit_priority.gate_flags.some(g => g.code === 'VERIFY_BEFORE_INTERVIEW'));
  // raw score is not overwritten by the cap
  const fit = d.candidate_fit.score;
  const expectedRaw = Math.round((fit * 0.6 + 68 * 0.4) * 10) / 10;
  assert.equal(d.pursuit_priority.raw_score, expectedRaw);
});

test('SOP-P3 Joining gate: Joining 35-49 triggers RESOLVE', () => {
  const d = decide({ dealFactorScores: makeFactors(42) });
  assert.equal(d.pursuit_priority.final_decision, 'RESOLVE JOINING RISKS BEFORE INTERVIEW');
  assert.ok(d.pursuit_priority.gate_flags.some(g => g.code === 'RESOLVE_JOINING_RISKS'));
});

test('SOP-P4 Low joining: <35 caps at HOLD / DISENGAGE / NURTURE', () => {
  const d = decide({ dealFactorScores: makeFactors(30) });
  assert.equal(d.pursuit_priority.final_decision, 'HOLD / DISENGAGE / NURTURE');
  assert.ok(d.pursuit_priority.gate_flags.some(g => g.code === 'HOLD_DISENGAGE_NURTURE'));
});

test('SOP-P5 Mandatory gap blocks PRIORITY INTERVIEW', () => {
  const d = decide({ rowScores: makeRows(90, 90, 90), dealFactorScores: makeFactors(90), missingReq: ['Mandatory certification'] });
  assert.equal(d.pursuit_priority.final_decision, 'CRITICAL VALIDATION REQUIRED');
  assert.notEqual(d.pursuit_priority.final_decision, 'PRIORITY INTERVIEW');
  assert.ok(d.pursuit_priority.gate_flags.some(g => g.code === 'CRITICAL_VALIDATION_REQUIRED' && g.detail.includes('Mandatory certification')));
});

test('SOP-P6 N/A handling: leadership + qualifications N/A, no zero penalty', () => {
  const d = decide({ rowScores: makeRows(76, 82, 68, { 108: { score: null, status: 'na' }, 113: { score: null, status: 'na' } }) });
  assert.equal(d.pursuit_priority.display_score, 71);
  assert.equal(d.candidate_fit.person_score, 76);
  assert.equal(d.candidate_fit.role_score, 82);
});

test('SOP-P7 Low evidence: Confidence separate and Limited Evidence', () => {
  const d = decide({ evidence: { jdAvailable: true, resumeAvailable: false, mandatoryResolved: false, scoredAtLeast80Pct: false, recruiterEvidence: false, references: false } });
  assert.equal(d.confidence_score.label, 'Limited Evidence');
  assert.equal(d.confidence_score.score, 15);
  assert.equal(d.confidence_score.evidence_items.length, 6);
  // and confidence did not change fit/joining/priority
  const plain = decide();
  assert.equal(d.candidate_fit.score, plain.candidate_fit.score);
  assert.equal(d.joining_probability.score, plain.joining_probability.score);
  assert.equal(d.pursuit_priority.display_score, plain.pursuit_priority.display_score);
});

test('SOP-P8 Behavioral signal: scores unchanged, focus only', () => {
  const noSignal = decide();
  const withSignal = decide({ behavioralSignals: ['Low Momentum'] });
  assert.equal(withSignal.candidate_fit.score, noSignal.candidate_fit.score);
  assert.equal(withSignal.pursuit_priority.display_score, noSignal.pursuit_priority.display_score);
  const focus = withSignal.interview_focus;
  const sources = focus.map(f => f.source);
  assert.ok(sources.includes('Behavioral hypothesis'));
  assert.ok(focus.length <= 3);
});

test('SOP-P9 Multiple gates: primary mandatory-gap, other flags shown', () => {
  const d = decide({
    rowScores: makeRows(81, 45, 68),
    dealFactorScores: makeFactors(35),
    missingReq: ['Mandatory certification'],
  });
  assert.equal(d.pursuit_priority.final_decision, 'CRITICAL VALIDATION REQUIRED');
  const codes = d.pursuit_priority.gate_flags.map(g => g.code);
  assert.ok(codes.includes('VERIFY_BEFORE_INTERVIEW'));
  assert.ok(codes.includes('RESOLVE_JOINING_RISKS'));
  assert.equal(d.pursuit_priority.gate_flags[0].code, 'CRITICAL_VALIDATION_REQUIRED');
});

// ---- Confidence model ----
test('SOP-C1 Confidence full evidence = 100 High Confidence', () => {
  const d = decide();
  assert.equal(d.confidence_score.score, 100);
  assert.equal(d.confidence_score.label, 'High Confidence');
});

test('SOP-C2 Confidence 60-79 = Moderate Confidence', () => {
  const d = decide({ evidence: { jdAvailable: true, resumeAvailable: true, mandatoryResolved: true, scoredAtLeast80Pct: false, recruiterEvidence: false, references: true } });
  assert.equal(d.confidence_score.score, 60);
  assert.equal(d.confidence_score.label, 'Moderate Confidence');
});

// ---- Interview Focus ----
test('SOP-F1 Max three focus areas, each with 2-3 questions', () => {
  const d = decide({ dealFactorScores: makeFactors(30) });
  assert.ok(d.interview_focus.length >= 1 && d.interview_focus.length <= 3);
  d.interview_focus.forEach(f => {
    assert.ok(f.questions.length >= 2 && f.questions.length <= 3);
  });
  // gate-driven focus comes first
  assert.equal(d.interview_focus[0].source, 'Joining risk');
});

test('SOP-F2 No fabrication: full evidence + strong scores => no focus areas', () => {
  const d = decide({ rowScores: makeRows(90, 90, 90), dealFactorScores: makeFactors(90) });
  assert.equal(d.interview_focus.length, 0);
});

// ---- Rules/data objects ----
test('SOP-D1 Snapshot carries raw + display + rules_version', () => {
  const d = decide();
  assert.equal(d.pursuit_priority.display_score, 71);
  assert.equal(d.pursuit_priority.raw_score, 71.1);
  assert.equal(d.pursuit_priority.rules_version, 'sop-1.0');
  assert.equal(d.joining_probability.deal_factors.length, 8);
});

// ---- Persistence round-trip via decisionService (in-memory DB harness) ----
function seededSopDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT NOT NULL,
      name TEXT NOT NULL, email TEXT, capability_match_pct INTEGER, resume_text TEXT,
      job_description_id INTEGER
    );
    CREATE TABLE scorecards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL UNIQUE,
      applicant_name TEXT, email TEXT, client TEXT, position TEXT
    );
    CREATE TABLE parameters (
      id INTEGER PRIMARY KEY, name TEXT, description TEXT, weightage INTEGER, grp TEXT, status TEXT
    );
    CREATE TABLE scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL, parameter_id INTEGER NOT NULL,
      score INTEGER, status TEXT DEFAULT 'active', note TEXT,
      UNIQUE(scorecard_id, parameter_id)
    );
    CREATE TABLE deal_factor_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL, factor_key TEXT NOT NULL,
      score INTEGER, note TEXT, UNIQUE(scorecard_id, factor_key)
    );
    CREATE TABLE scoring_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL UNIQUE, rules_version TEXT,
      pursuit_priority_raw REAL, pursuit_priority_display INTEGER, base_band TEXT, final_decision TEXT,
      gate_flags TEXT, candidate_fit REAL, person_score REAL, role_score REAL, jd_match_score REAL,
      joining_probability REAL, joining_band TEXT, confidence_score REAL, confidence_label TEXT,
      confidence_evidence TEXT, deal_factors TEXT, interview_focus TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE parameter_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL);
    CREATE TABLE must_have_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL, jd_id INTEGER,
      requirement_text TEXT NOT NULL, met INTEGER NOT NULL DEFAULT 0, evidence TEXT,
      severity TEXT DEFAULT 'critical'
    );
  `);
  db.prepare(`INSERT INTO users (id, username, password, role, name, email, capability_match_pct, resume_text, job_description_id)
    VALUES (1, 'emp1', 'x', 'employee', 'Sai Kumar', 'sai@example.com', 55, 'Resume text', 1)`).run();
  db.prepare(`INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (1, 'Sai Kumar', 'sai@example.com', 'Suez', 'Data Analyst')`).run();
  PARAMS.forEach(p => db.prepare(`INSERT INTO parameters (id, name, weightage, grp, status) VALUES (?, ?, ?, ?, 'active')`).run(p.id, p.name, p.weightage, p.grp));
  return db;
}

function withDb(db, fn) {
  const dbPath = require.resolve('../database');
  const svcPath = require.resolve('../decisionService');
  const utilPath = require.resolve('../scoreUtils');
  const cached = [[dbPath, require.cache[dbPath]], [svcPath, require.cache[svcPath]], [utilPath, require.cache[utilPath]]];
  try {
    require.cache[dbPath] = { exports: db };
    delete require.cache[svcPath];
    delete require.cache[utilPath];
    const fresh = require('../decisionService');
    return fn(fresh);
  } finally {
    cached.forEach(([p, entry]) => {
      if (entry) require.cache[p] = entry;
      else delete require.cache[p];
    });
  }
}

test('SOP-DB1 computeAndPersist snapshots the full decision', () => {
  const db = seededSopDb();
  PARAMS.forEach(p => {
    const v = p.grp === 'PERSON' ? 76 : p.grp === 'ROLE' ? 82 : 68;
    db.prepare(`INSERT INTO scores (scorecard_id, parameter_id, score, status) VALUES (1, ?, ?, 'active')`).run(p.id, v);
  });
  FACTOR_KEYS.forEach(k => db.prepare(`INSERT INTO deal_factor_scores (scorecard_id, factor_key, score) VALUES (1, ?, 68)`).run(k));

  withDb(db, (svc) => {
    const decision = svc.computeAndPersistDecision(1);
    assert.equal(decision.pursuit_priority.display_score, 71);
    assert.equal(decision.pursuit_priority.rules_version, 'sop-1.0');

    const snap = svc.readSnapshot(1);
    assert.equal(snap.pursuit_priority_display, 71);
    assert.equal(snap.final_decision, 'INTERVIEW');
    assert.equal(snap.deal_factors.length, 8);
    assert.equal(snap.candidate_fit, 73.2);
    assert.equal(snap.joining_probability, 68);
  });
});

test('SOP-DB2 gate is captured for low joining probability', () => {
  const db = seededSopDb();
  PARAMS.forEach(p => {
    const v = p.grp === 'PERSON' ? 81 : p.grp === 'ROLE' ? 82 : 30;
    db.prepare(`INSERT INTO scores (scorecard_id, parameter_id, score, status) VALUES (1, ?, ?, 'active')`).run(p.id, v);
  });
  FACTOR_KEYS.forEach(k => db.prepare(`INSERT INTO deal_factor_scores (scorecard_id, factor_key, score) VALUES (1, ?, 30)`).run(k));

  withDb(db, (svc) => {
    const decision = svc.computeAndPersistDecision(1);
    assert.equal(decision.pursuit_priority.final_decision, 'HOLD / DISENGAGE / NURTURE');
    const snap = svc.readSnapshot(1);
    assert.ok(snap.gate_flags.some(g => g.code === 'HOLD_DISENGAGE_NURTURE'));
  });
});

test('SOP-DB3 N/A parameter is excluded when persisted', () => {
  const db = seededSopDb();
  PARAMS.forEach(p => {
    const v = p.grp === 'PERSON' ? 76 : p.grp === 'ROLE' ? 82 : 68;
    const status = p.id === 108 || p.id === 113 ? 'na' : 'active';
    db.prepare(`INSERT INTO scores (scorecard_id, parameter_id, score, status) VALUES (1, ?, ?, ?)`).run(p.id, v, status);
  });
  FACTOR_KEYS.forEach(k => db.prepare(`INSERT INTO deal_factor_scores (scorecard_id, factor_key, score) VALUES (1, ?, 68)`).run(k));

  withDb(db, (svc) => {
    const decision = svc.computeAndPersistDecision(1);
    assert.equal(decision.candidate_fit.person_score, 76);
    assert.equal(decision.candidate_fit.role_score, 82);
  });
});