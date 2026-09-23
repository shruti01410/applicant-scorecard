const db = require('./database');
const { computeDecision, RULES_VERSION } = require('./scoreUtils');

function activeParams() {
  return db.prepare(`SELECT id, name, weightage, grp FROM parameters WHERE status = 'active' AND grp IS NOT NULL ORDER BY id`).all();
}

function scoresFor(scorecardId) {
  const rows = db.prepare(`
    SELECT s.parameter_id, s.score, s.status, p.name
    FROM scores s JOIN parameters p ON p.id = s.parameter_id
    WHERE s.scorecard_id = ? AND p.status = 'active'
  `).all(scorecardId);
  const map = {};
  rows.forEach(r => { map[r.parameter_id] = { score: r.score, status: r.status, name: r.name }; });
  return map;
}

function dealFactorsFor(scorecardId) {
  const rows = db.prepare(`SELECT factor_key, score, note FROM deal_factor_scores WHERE scorecard_id = ?`).all(scorecardId);
  const map = {};
  rows.forEach(r => { map[r.factor_key] = r.score; });
  return map;
}

function mustHaveContext(scorecardId) {
  const rows = scorecardId
    ? db.prepare(`SELECT requirement_text, met, severity FROM must_have_results WHERE scorecard_id = ?`).all(scorecardId)
    : [];
  const critical = rows.filter(r => r.severity === 'critical');
  const missing = critical.filter(r => !r.met).map(r => r.requirement_text);
  return {
    missing,
    mandatoryResolved: critical.length > 0 && missing.length === 0,
  };
}

function evidenceContext(scorecardId, employeeId) {
  const u = db.prepare(`SELECT resume_text, job_description_id FROM users WHERE id = ?`).get(employeeId) || {};
  const jdAvailable = !!u.job_description_id;
  const resumeAvailable = !!(u.resume_text && String(u.resume_text).trim().length > 0);
  let hasRecruiterEvidence = false;
  if (scorecardId) {
    hasRecruiterEvidence = db.prepare(`SELECT COUNT(*) AS c FROM parameter_evidence WHERE scorecard_id = ?`).get(scorecardId).c > 0;
  }
  const { mandatoryResolved } = mustHaveContext(scorecardId);
  return { jdAvailable, resumeAvailable, mandatoryResolved, hasRecruiterEvidence, references: false };
}

// Compute the full SOP decision for an employee, persist the snapshot, return it.
// opts: { behavioralSignals } — Inner Intelligence signals (informational only).
function computeAndPersistDecision(employeeId, opts = {}) {
  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(employeeId);
  const emp = db.prepare('SELECT capability_match_pct FROM users WHERE id = ?').get(employeeId) || {};
  if (!sc) return null;

  const params = activeParams();
  const rowScores = scoresFor(sc.id);
  const factorScores = dealFactorsFor(sc.id);
  const { missing } = mustHaveContext(sc.id);
  const ev = evidenceContext(sc.id, employeeId);

  const scoredCount = Object.values(rowScores).filter(r => r.score != null && r.status === 'active').length;
  const scoredAtLeast80Pct = params.length > 0 ? scoredCount / params.length >= 0.8 : false;

  const decision = computeDecision({
    params,
    rowScores,
    dealFactorScores: factorScores,
    jdMatchPct: emp.capability_match_pct,
    missingReq: missing,
    evidence: { ...ev, scoredAtLeast80Pct },
    behavioralSignals: opts.behavioralSignals || [],
  });

  const d = decision;
  db.prepare(`
    INSERT INTO scoring_snapshots (
      scorecard_id, rules_version, pursuit_priority_raw, pursuit_priority_display,
      base_band, final_decision, gate_flags, candidate_fit, person_score, role_score,
      jd_match_score, joining_probability, joining_band, confidence_score, confidence_label,
      confidence_evidence, deal_factors, interview_focus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scorecard_id) DO UPDATE SET
      rules_version = excluded.rules_version,
      pursuit_priority_raw = excluded.pursuit_priority_raw,
      pursuit_priority_display = excluded.pursuit_priority_display,
      base_band = excluded.base_band,
      final_decision = excluded.final_decision,
      gate_flags = excluded.gate_flags,
      candidate_fit = excluded.candidate_fit,
      person_score = excluded.person_score,
      role_score = excluded.role_score,
      jd_match_score = excluded.jd_match_score,
      joining_probability = excluded.joining_probability,
      joining_band = excluded.joining_band,
      confidence_score = excluded.confidence_score,
      confidence_label = excluded.confidence_label,
      confidence_evidence = excluded.confidence_evidence,
      deal_factors = excluded.deal_factors,
      interview_focus = excluded.interview_focus,
      calculated_at = CURRENT_TIMESTAMP
  `).run(
    sc.id, d.rules_version || RULES_VERSION,
    d.pursuit_priority.raw_score, d.pursuit_priority.display_score,
    d.pursuit_priority.base_band, d.pursuit_priority.final_decision,
    JSON.stringify(d.pursuit_priority.gate_flags),
    d.candidate_fit.score, d.candidate_fit.person_score, d.candidate_fit.role_score,
    d.candidate_fit.jd_match_score,
    d.joining_probability.score, d.joining_probability.band,
    d.confidence_score.score, d.confidence_score.label,
    JSON.stringify(d.confidence_score.evidence_items),
    JSON.stringify(d.joining_probability.deal_factors),
    JSON.stringify(d.interview_focus)
  );

  return { ...d, scorecard_id: sc.id };
}

// Lightweight decision summary for list rows (fits / joining / priority / confidence).
function summaryForRow(employeeId) {
  const decision = computeAndPersistDecision(employeeId);
  if (!decision) {
    return {
      pursuit_priority: null, candidate_fit: null,
      joining_probability: null, confidence_score: null,
      person_score: null, role_score: null, deal_score: null, weighted_pct: null,
    };
  }
  return {
    pursuit_priority: decision.pursuit_priority,
    candidate_fit: decision.candidate_fit,
    joining_probability: decision.joining_probability,
    confidence_score: decision.confidence_score,
    person_score: decision.person_score,
    role_score: decision.role_score,
    deal_score: decision.deal_score,
    final_decision: decision.pursuit_priority.final_decision,
    base_band: decision.pursuit_priority.base_band,
    weighted_pct: decision.pursuit_priority.display_score,
  };
}

function readSnapshot(scorecardId) {
  const row = db.prepare(`SELECT * FROM scoring_snapshots WHERE scorecard_id = ?`).get(scorecardId);
  if (!row) return null;
  return {
    ...row,
    gate_flags: safeJson(row.gate_flags, []),
    confidence_evidence: safeJson(row.confidence_evidence, []),
    deal_factors: safeJson(row.deal_factors, []),
    interview_focus: safeJson(row.interview_focus, []),
  };
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
}

module.exports = {
  computeAndPersistDecision,
  summaryForRow,
  readSnapshot,
  scoresFor,
  dealFactorsFor,
  mustHaveContext,
  activeParams,
};