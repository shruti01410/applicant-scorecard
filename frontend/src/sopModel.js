// Client-side mirror of the SOP scoring model (backend/scoreUtils.js).
// Used only for instant preview on the scorecard page before saving.

import { LOW_COLOR, MODERATE_COLOR, GOOD_COLOR, STRONG_COLOR, NEUTRAL_COLOR, scoreMeta } from './scoreStatus';

export const DEAL_FACTORS = [
  { key: 'active_search', label: 'Active-search urgency & role intent', weight: 15, group: 'D1' },
  { key: 'career_motive', label: 'Career motivation & values alignment', weight: 15, group: 'D1' },
  { key: 'engagement', label: 'Process engagement & responsiveness', weight: 10, group: 'D1' },
  { key: 'counter_offer', label: 'Counter-offer / competitive-process exposure', weight: 15, group: 'D2' },
  { key: 'timeline', label: 'Joining timeline & notice feasibility', weight: 15, group: 'D2' },
  { key: 'worklife', label: 'Work-life, location & schedule fit', weight: 10, group: 'D2' },
  { key: 'dropout', label: 'Untoward-scenario / dropout risk', weight: 10, group: 'D2' },
  { key: 'compensation', label: 'Compensation expectations & flexibility', weight: 10, group: 'D3' },
];

export function groupScore(params, scores, grp) {
  let weightSum = 0, weighted = 0;
  for (const p of params) {
    if (p.grp !== grp) continue;
    const row = scores[p.id];
    if (!row || row.status === 'na' || row.status === 'not_scored' || row.score == null) continue;
    weightSum += p.weightage;
    weighted += Number(row.score) * p.weightage;
  }
  if (!weightSum) return null;
  return weighted / weightSum;
}

export function candidateFit(person, role, jdMatch) {
  const parts = [];
  if (person != null) parts.push([person, 0.35]);
  if (role != null) parts.push([role, 0.4]);
  if (jdMatch != null) parts.push([jdMatch, 0.25]);
  const tw = parts.reduce((a, [, w]) => a + w, 0);
  if (!tw) return null;
  return parts.reduce((a, [s, w]) => a + (s * w) / tw, 0);
}

export function joiningProbability(factors) {
  const available = DEAL_FACTORS.filter(f => factors[f.key] != null);
  const tw = available.reduce((a, f) => a + f.weight, 0);
  if (!tw) return null;
  return available.reduce((a, f) => a + (Number(factors[f.key]) * f.weight) / tw, 0);
}

export function pursuitPriority(fit, join) {
  if (fit == null && join == null) return null;
  const f = fit == null ? join : fit;
  const j = join == null ? fit : join;
  return f * 0.6 + j * 0.4;
}

export function priorityBand(score) {
  if (score == null) return 'NOT SCORED';
  if (score >= 80) return 'PRIORITY INTERVIEW';
  if (score >= 65) return 'INTERVIEW';
  if (score >= 50) return 'VERIFY BEFORE INTERVIEW';
  return 'HOLD / DISENGAGE / NURTURE';
}

export function joiningBand(score) {
  if (score == null) return 'Unscored';
  if (score >= 80) return 'STRONG COMMITMENT';
  if (score >= 65) return 'LIKELY TO JOIN';
  if (score >= 50) return 'UNCERTAIN CONVERSION';
  if (score >= 35) return 'HIGH REWORK RISK';
  return 'VERY LOW PROBABILITY';
}

const GATE_DECISIONS = {
  CRITICAL_VALIDATION_REQUIRED: 'CRITICAL VALIDATION REQUIRED',
  VERIFY_BEFORE_INTERVIEW: 'VERIFY BEFORE INTERVIEW',
  RESOLVE_JOINING_RISKS: 'RESOLVE JOINING RISKS BEFORE INTERVIEW',
  HOLD_DISENGAGE_NURTURE: 'HOLD / DISENGAGE / NURTURE',
};

export function applyGates(role, joining, missingRequirements) {
  const flags = [];
  if (missingRequirements && missingRequirements.length > 0) {
    flags.push({ code: 'CRITICAL_VALIDATION_REQUIRED', priority: 1, detail: `Missing mandatory JD requirement(s): ${missingRequirements.join(', ')}. Priority Interview is not allowed.` });
  }
  if (role != null && role < 50) {
    flags.push({ code: 'VERIFY_BEFORE_INTERVIEW', priority: 2, detail: `Role score ${Math.round(role * 10) / 10} is below 50 — routing capped at VERIFY BEFORE INTERVIEW.` });
  }
  if (joining != null && joining >= 35 && joining < 50) {
    flags.push({ code: 'RESOLVE_JOINING_RISKS', priority: 3, detail: `Joining Probability ${Math.round(joining)} — resolve the deal/joining barriers before interview.` });
  }
  if (joining != null && joining < 35) {
    flags.push({ code: 'HOLD_DISENGAGE_NURTURE', priority: 4, detail: `Joining Probability ${Math.round(joining)} is below 35 — HOLD / DISENGAGE / NURTURE.` });
  }
  flags.sort((a, b) => a.priority - b.priority);
  return { gate_flags: flags, final_decision_override: flags[0] ? GATE_DECISIONS[flags[0].code] : null };
}

export function computeConfidence(ctx) {
  const items = [
    { item: 'JD available and parsed', available: !!ctx.jdAvailable, points: 15 },
    { item: 'Resume available and parsed', available: !!ctx.resumeAvailable, points: 15 },
    { item: 'All mandatory JD requirements resolved', available: !!ctx.mandatoryResolved, points: 20 },
    { item: 'At least 80% of activated parameters scored', available: !!ctx.scoredAtLeast80Pct, points: 25 },
    { item: 'Recruiter/interview evidence attached', available: !!ctx.recruiterEvidence, points: 15 },
    { item: 'References or verified evidence available', available: !!ctx.references, points: 10 },
  ];
  const score = items.reduce((a, it) => a + (it.available ? it.points : 0), 0);
  return {
    score,
    label: score >= 80 ? 'High Confidence' : score >= 60 ? 'Moderate Confidence' : 'Limited Evidence',
    evidence_items: items,
  };
}

export function computeLive(params, scores, deal, ctx = {}) {
  const person = groupScore(params, scores, 'PERSON');
  const role = groupScore(params, scores, 'ROLE');
  const join = joiningProbability(deal);
  const fit = candidateFit(person, role, ctx.jdMatch != null ? ctx.jdMatch : null);
  const priority = pursuitPriority(fit, join);
  const baseBand = priorityBand(priority);
  const { gate_flags, final_decision_override } = applyGates(role, join, ctx.missing || []);
  return {
    pursuit_priority: {
      display_score: priority == null ? null : Math.round(priority),
      raw_score: priority,
      base_band: baseBand,
      final_decision: final_decision_override || baseBand,
      gate_flags,
    },
    candidate_fit: {
      score: fit == null ? null : Math.round(fit * 10) / 10,
      person_score: person == null ? null : Math.round(person * 10) / 10,
      role_score: role == null ? null : Math.round(role * 10) / 10,
      jd_match_score: ctx.jdMatch != null ? ctx.jdMatch : null,
    },
    joining_probability: {
      score: join == null ? null : Math.round(join * 10) / 10,
      band: joiningBand(join),
      factors: DEAL_FACTORS.map(f => ({ ...f, score: deal[f.key] == null ? null : Number(deal[f.key]) })),
    },
    confidence_score: computeConfidence(ctx),
  };
}

export const decisionColors = {
  'PRIORITY INTERVIEW': STRONG_COLOR,
  'INTERVIEW': GOOD_COLOR,
  'VERIFY BEFORE INTERVIEW': MODERATE_COLOR,
  'HOLD / DISENGAGE / NURTURE': LOW_COLOR,
  'CRITICAL VALIDATION REQUIRED': LOW_COLOR,
  'RESOLVE JOINING RISKS BEFORE INTERVIEW': MODERATE_COLOR,
  'NOT SCORED': NEUTRAL_COLOR,
};

export function pursuitColor(score) {
  return scoreMeta(score).color;
}