const db = require('./database');

// ---------------------------------------------------------------------------
// Legacy weighted score (kept for read-only historical scorecards)
// ---------------------------------------------------------------------------

// Weighted percentage: Σ( score/5 × weightage ), rounded. Weights sum to 100,
// so the result is a 0-100 percentage.
function weightedPct(scores) {
  if (!scores || scores.length === 0) return null;
  const total = scores.reduce((acc, s) => acc + (s.score / 5) * (s.weightage || 0), 0);
  return Math.round(total);
}

// Load a scorecard for a given employee id with its scores joined to parameters.
// Returns null if the employee has no scorecard yet.
function loadScorecard(employeeId) {
  const sc = db.prepare('SELECT * FROM scorecards WHERE employee_id = ?').get(employeeId);
  if (!sc) return null;

  const scores = db.prepare(`
    SELECT s.parameter_id, s.score, s.status, s.note, p.name, p.description, p.weightage, p.grp
    FROM scores s
    JOIN parameters p ON p.id = s.parameter_id
    WHERE s.scorecard_id = ?
  `).all(sc.id);

  return { ...sc, scores };
}

// ---------------------------------------------------------------------------
// SOP scoring model — PERSON / ROLE / DEAL (16 parameters)
// ---------------------------------------------------------------------------

const RULES_VERSION = 'sop-1.0';

// 8 DEAL evidence factors powering Joining Probability (weights sum to 100).
const DEAL_FACTORS = [
  { key: 'active_search', label: 'Active-search urgency & role intent', weight: 15, param: 'D1' },
  { key: 'career_motive',  label: 'Career motivation & Work Emotion alignment', weight: 15, param: 'D1' },
  { key: 'engagement',     label: 'Process engagement & responsiveness', weight: 10, param: 'D1' },
  { key: 'counter_offer',  label: 'Counter-offer & competitive-process exposure', weight: 15, param: 'D2' },
  { key: 'timeline',       label: 'Joining timeline & notice feasibility', weight: 15, param: 'D2' },
  { key: 'worklife',       label: 'Work-life, location & schedule fit', weight: 10, param: 'D2' },
  { key: 'dropout',        label: 'Untoward-scenario / dropout risk', weight: 10, param: 'D2' },
  { key: 'compensation',   label: 'Compensation expectations & flexibility', weight: 10, param: 'D3' },
];

// Pursuit Priority routing bands.
function priorityBand(score) {
  if (score == null) return 'NOT SCORED';
  if (score >= 80) return 'PRIORITY INTERVIEW';
  if (score >= 65) return 'INTERVIEW';
  if (score >= 50) return 'VERIFY BEFORE INTERVIEW';
  return 'HOLD / DISENGAGE / NURTURE';
}

// Joining Probability bands.
function joiningBand(score) {
  if (score == null) return 'UNSCORED';
  if (score >= 80) return 'STRONG COMMITMENT';
  if (score >= 65) return 'LIKELY TO JOIN';
  if (score >= 50) return 'UNCERTAIN CONVERSION';
  if (score >= 35) return 'HIGH REWORK RISK';
  return 'VERY LOW PROBABILITY';
}

// Weighted mean of the active + scored parameters in a group.
// N/A and not_scored parameters are excluded and remaining weights renormalize.
// `params` = [{ id, grp, weightage }] active only; `rowScores` keyed by parameter_id.
function groupScore(params, rowScores, grp) {
  const included = [];
  for (const p of params) {
    if (p.grp !== grp) continue;
    const row = rowScores[p.id];
    if (!row || row.status === 'na' || row.status === 'not_scored' || row.score == null) continue;
    included.push({ weight: p.weightage, score: Number(row.score) });
  }
  if (included.length === 0) return null;
  const totalWeight = included.reduce((a, r) => a + r.weight, 0);
  if (!totalWeight) return null;
  return included.reduce((a, r) => a + (r.score * r.weight) / totalWeight, 0);
}

// Candidate Fit = PERSON×0.35 + ROLE×0.40 + JD MATCH×0.25.
// Unavailable components are dropped and the remaining weights renormalized.
function computeCandidateFit(person, role, jdMatch) {
  const parts = [];
  if (person != null) parts.push([person, 0.35]);
  if (role != null) parts.push([role, 0.40]);
  if (jdMatch != null) parts.push([jdMatch, 0.25]);
  const totalWeight = parts.reduce((a, [, w]) => a + w, 0);
  if (!totalWeight) return null;
  return parts.reduce((a, [s, w]) => a + (s * w) / totalWeight, 0);
}

// Joining Probability = weighted total of the 8 DEAL evidence factors (0-100 each).
function computeJoiningProbability(factorScores) {
  const available = DEAL_FACTORS.filter(f => factorScores[f.key] != null);
  if (available.length === 0) return null;
  const totalWeight = available.reduce((a, f) => a + f.weight, 0);
  if (!totalWeight) return null;
  return available.reduce((a, f) => a + (Number(factorScores[f.key]) * f.weight) / totalWeight, 0);
}

// Pursuit Priority = Candidate Fit×0.60 + Joining Probability×0.40.
function computePursuitPriority(fit, joining) {
  if (fit == null && joining == null) return null;
  const f = fit == null ? joining : fit;
  const j = joining == null ? fit : joining;
  return f * 0.6 + j * 0.4;
}

// §6 Critical gates. Returns ordered flags + the final routing decision.
function applyGates({ role, joining, missingRequirements }, baseBand) {
  const flags = [];
  if (missingRequirements && missingRequirements.length > 0) {
    flags.push({
      code: 'CRITICAL_VALIDATION_REQUIRED',
      priority: 1,
      detail: `Missing mandatory JD requirement(s): ${missingRequirements.join(', ')}. Priority Interview is not allowed.`,
    });
  }
  if (role != null && role < 50) {
    flags.push({
      code: 'VERIFY_BEFORE_INTERVIEW',
      priority: 2,
      detail: `ROLE ${Math.round(role)} is below 50 — routing capped at VERIFY BEFORE INTERVIEW.`,
    });
  }
  if (joining != null && joining >= 35 && joining < 50) {
    flags.push({
      code: 'RESOLVE_JOINING_RISKS',
      priority: 3,
      detail: `Joining Probability ${Math.round(joining)} — resolve the deal/joining barriers before interview.`,
    });
  }
  if (joining != null && joining < 35) {
    flags.push({
      code: 'HOLD_DISENGAGE_NURTURE',
      priority: 4,
      detail: `Joining Probability ${Math.round(joining)} is below 35 — HOLD / DISENGAGE / NURTURE.`,
    });
  }
  flags.sort((a, b) => a.priority - b.priority);

  const primary = flags.length > 0 ? flags[0].code : null;
  const but = {
    CRITICAL_VALIDATION_REQUIRED: 'CRITICAL VALIDATION REQUIRED',
    VERIFY_BEFORE_INTERVIEW: 'VERIFY BEFORE INTERVIEW',
    RESOLVE_JOINING_RISKS: 'RESOLVE JOINING RISKS BEFORE INTERVIEW',
    HOLD_DISENGAGE_NURTURE: 'HOLD / DISENGAGE / NURTURE',
  };
  const finalDecision = primary ? but[primary] : baseBand;
  return { gate_flags: flags, finalDecision, baseBand };
}

// §7 Confidence — evidence completeness, never alters fit/joining/priority.
// `evidence`: { jdAvailable, resumeAvailable, mandatoryResolved, scoredAtLeast80Pct, recruiterEvidence, references }
function computeConfidence(evidence = {}) {
  const items = [
    { item: 'JD available and parsed', available: !!evidence.jdAvailable, points: 15 },
    { item: 'Resume available and parsed', available: !!evidence.resumeAvailable, points: 15 },
    { item: 'All mandatory JD requirements resolved', available: !!evidence.mandatoryResolved, points: 20 },
    { item: 'At least 80% of activated parameters scored', available: !!evidence.scoredAtLeast80Pct, points: 25 },
    { item: 'Recruiter/interview evidence attached', available: !!evidence.recruiterEvidence, points: 15 },
    { item: 'References or verified evidence available', available: !!evidence.references, points: 10 },
  ];
  const score = items.reduce((a, it) => a + (it.available ? it.points : 0), 0);
  const label = score >= 80 ? 'High Confidence' : score >= 60 ? 'Moderate Confidence' : 'Limited Evidence';
  return { score, label, evidence_items: items.map(it => ({ ...it, earned: it.available ? it.points : 0 })) };
}

// §9 Interview Focus — max 3, ranked by decision risk / evidence weakness.
const FOCUS_QUESTION_BANK = {
  default: [
    'Walk me through a recent situation where this area was tested. What did you do?',
    'What evidence can you point to that supports your strength here?',
    'What would your previous manager say about this area?',
  ],
  communication: [
    'Describe a time you had to persuade a sceptical stakeholder. What was the outcome?',
    'How do you adjust your message for a technical vs a non-technical audience?',
  ],
  technical: [
    'Walk me through a hard technical problem you recently solved. What was your approach?',
    'How do you keep your technical skills current?',
  ],
  initiative: [
    'Tell me about a time you acted before being asked. What did you own, and what was the result?',
    'Describe a commitment that became difficult to keep. What did you do next?',
  ],
  compensation: [
    'What are your current and expected compensation? How flexible are you?',
    'If the offer came in below expectation, what would matter most in your decision?',
  ],
  timeline: [
    'When can you realistically join, and what is your notice period?',
    'Are you in other processes right now? How would you choose between them?',
  ],
  certification: [
    'Confirm which mandatory certifications you hold and which are in progress.',
    'If a required certification is missing, how quickly could you obtain it?',
  ],
  leadership: [
    'Describe a time you led a project or team without formal authority.',
    'How do you develop others around you?',
  ],
  collaboration: [
    'Tell me about a conflict with a teammate and how you resolved it.',
    'What role do you usually take on a team?',
  ],
};

function questionsFor(title) {
  const t = title.toLowerCase();
  let bank = FOCUS_QUESTION_BANK.default;
  if (t.includes('communication') || t.includes('influence')) bank = FOCUS_QUESTION_BANK.communication;
  else if (t.includes('technical') || t.includes('competence') || t.includes('role')) bank = FOCUS_QUESTION_BANK.technical;
  else if (t.includes('initiative') || t.includes('drive') || t.includes('follow-through')) bank = FOCUS_QUESTION_BANK.initiative;
  else if (t.includes('compensation') || t.includes('salary') || t.includes('pay')) bank = FOCUS_QUESTION_BANK.compensation;
  else if (t.includes('timeline') || t.includes('joining') || t.includes('availability') || t.includes('notice')) bank = FOCUS_QUESTION_BANK.timeline;
  else if (t.includes('certificat') || t.includes('qualification') || t.includes('mandatory')) bank = FOCUS_QUESTION_BANK.certification;
  else if (t.includes('leadership')) bank = FOCUS_QUESTION_BANK.leadership;
  else if (t.includes('collaboration') || t.includes('teamwork') || t.includes('team')) bank = FOCUS_QUESTION_BANK.collaboration;
  return bank.slice(0, 3);
}

function computeInterviewFocus({ params, gateFlags, rowScores, behavioralSignals = [] }) {
  const focus = [];
  const nameOf = (id) => (params.find(p => p.id === id) || {}).name || 'the weakest area';

  // 1. Mandatory / gate issues rank first (decision risk).
  const gateFocus = gateFlags.find(f => f.code === 'CRITICAL_VALIDATION_REQUIRED');
  if (gateFocus) {
    focus.push({ source: 'Mandatory/gate issue', title: 'Confirm mandatory certification or resolve the gate', questions: questionsFor('certification') });
  }
  const joinGate = gateFlags.find(f => f.code === 'RESOLVE_JOINING_RISKS');
  const holdGate = gateFlags.find(f => f.code === 'HOLD_DISENGAGE_NURTURE');
  if (joinGate || holdGate) {
    const title = 'Resolve compensation gap and joining timeline';
    focus.push({ source: 'Joining risk', title, questions: questionsFor('timeline').concat(['Clarify compensation expectations and flexibility.']) });
  }

  // 2. Lowest critical scored area (evidence weakness).
  if (focus.length < 3) {
    const scored = Object.entries(rowScores)
      .filter(([, r]) => r.score != null && r.status === 'active')
      .sort((a, b) => a[1].score - b[1].score);
    if (scored.length > 0 && scored[0][1].score < 65) {
      const lowestId = Number(scored[0][0]);
      focus.push({ source: 'Lowest critical Scorecard/JD area', title: `Validate ${nameOf(lowestId)}`, questions: questionsFor(nameOf(lowestId)) });
    }
  }

  // 3. Behavioral hypothesis (Inner Intelligence signals only inform questions).
  if (focus.length < 3 && behavioralSignals.length > 0) {
    const sig = behavioralSignals[0];
    focus.push({ source: 'Behavioral hypothesis', title: `Explore ${sig}`, questions: FOCUS_QUESTION_BANK.initiative.slice(0, 2) });
  }

  return focus.slice(0, 3);
}

// §12 full processing sequence. Returns the complete decision-card data object.
// inputs:
//   params          [{ id, grp, weightage, name }] active parameters
//   rowScores       { parameterId: { score, status } }
//   dealFactorScores { factorKey: score(0-100) }
//   jdMatchPct      number|null
//   missingReq      [missing mandatory JD requirement names]
//   evidence        {	jAvailable, resumeAvailable, mandatoryResolved, hasRecruiterEvidence, hasReferences }
//   behavioralSignals [...labels] (Inner Intelligence, informational only)
function computeDecision(inputs) {
  const { params, rowScores, dealFactorScores = {}, jdMatchPct = null, missingReq = [], evidence = {}, behavioralSignals = [] } = inputs;

  const person = groupScore(params, rowScores, 'PERSON');
  const role = groupScore(params, rowScores, 'ROLE');
  const deal = groupScore(params, rowScores, 'DEAL');
  const joining = computeJoiningProbability(dealFactorScores);
  const candidateFit = computeCandidateFit(person, role, jdMatchPct);
  const priority = computePursuitPriority(candidateFit, joining);
  const baseBand = priorityBand(priority);
  const gates = applyGates({ role, joining, missingRequirements: missingReq }, baseBand);
  const confidence = computeConfidence(evidence);
  const interviewFocus = computeInterviewFocus({ params, gateFlags: gates.gate_flags, rowScores, behavioralSignals });

  return {
    pursuit_priority: {
      raw_score: priority == null ? null : Math.round(priority * 10) / 10,
      display_score: priority == null ? null : Math.round(priority),
      base_band: baseBand,
      final_decision: gates.finalDecision,
      gate_flags: gates.gate_flags,
      calculated_at: new Date().toISOString(),
      rules_version: RULES_VERSION,
    },
    candidate_fit: {
      score: candidateFit == null ? null : Math.round(candidateFit * 10) / 10,
      person_score: person == null ? null : Math.round(person * 10) / 10,
      role_score: role == null ? null : Math.round(role * 10) / 10,
      jd_match_score: jdMatchPct == null ? null : jdMatchPct,
    },
    joining_probability: {
      score: joining == null ? null : Math.round(joining * 10) / 10,
      band: joiningBand(joining),
      deal_factors: DEAL_FACTORS.map(f => ({
        ...f,
        score: dealFactorScores[f.key] == null ? null : Math.round(Number(dealFactorScores[f.key])),
        mapped_parameter: f.param,
      })),
    },
    person_score: person == null ? null : Math.round(person * 10) / 10,
    role_score: role == null ? null : Math.round(role * 10) / 10,
    deal_score: deal == null ? null : Math.round(deal * 10) / 10,
    confidence_score: confidence,
    interview_focus: interviewFocus,
    inner_intelligence: {
      label: 'Behavioral Reflection',
      note: 'Not used directly in Candidate Fit or Joining Probability',
      signals: behavioralSignals,
    },
    rules_version: RULES_VERSION,
  };
}

module.exports = {
  weightedPct,
  loadScorecard,
  RULES_VERSION,
  DEAL_FACTORS,
  groupScore,
  computeCandidateFit,
  computeJoiningProbability,
  computePursuitPriority,
  priorityBand,
  joiningBand,
  applyGates,
  computeConfidence,
  computeInterviewFocus,
  computeDecision,
};