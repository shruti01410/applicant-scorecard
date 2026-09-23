const express = require('express');
const { authenticate } = require('../middleware/auth');
const { weightedPct, loadScorecard } = require('../scoreUtils');
const decisionService = require('../decisionService');

const router = express.Router();
router.use(authenticate);

// Current employee's own scorecard (read-only, limited projection: no internal
// SOP evidence, DEAL factor breakdown, gate flags, or interview-focus questions).
router.get('/scorecard', (req, res) => {
  const sc = loadScorecard(req.user.id);
  if (!sc) return res.json({ scorecard: null, scores: [], decision: null });

  const decision = decisionService.computeAndPersistDecision(req.user.id);

  res.json({
    scorecard: {
      id: sc.id,
      applicant_name: sc.applicant_name,
      email: sc.email,
      client: sc.client,
      position: sc.position,
      jd_shared: sc.jd_shared,
      company_id: sc.company_id,
      updated_at: sc.updated_at,
    },
    scores: sc.scores,
    weighted_pct: weightedPct(sc.scores),
    decision: decision ? {
      pursuit_priority: decision.pursuit_priority ? {
        raw_score: decision.pursuit_priority.raw_score,
        display_score: decision.pursuit_priority.display_score,
        base_band: decision.pursuit_priority.base_band,
        final_decision: decision.pursuit_priority.final_decision,
        calculated_at: decision.pursuit_priority.calculated_at,
      } : null,
      candidate_fit: decision.candidate_fit ? {
        score: decision.candidate_fit.score,
        person_score: decision.candidate_fit.person_score,
        role_score: decision.candidate_fit.role_score,
        jd_match_score: decision.candidate_fit.jd_match_score,
      } : null,
      joining_probability: decision.joining_probability ? {
        score: decision.joining_probability.score,
        band: decision.joining_probability.band,
      } : null,
      person_score: decision.person_score,
      role_score: decision.role_score,
      deal_score: decision.deal_score,
      confidence_score: decision.confidence_score ? {
        score: decision.confidence_score.score,
        label: decision.confidence_score.label,
      } : null,
      rules_version: decision.rules_version,
    } : null,
  });
});

module.exports = router;