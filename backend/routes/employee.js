const express = require('express');
const { authenticate } = require('../middleware/auth');
const { weightedPct, loadScorecard } = require('../scoreUtils');

const router = express.Router();
router.use(authenticate);

// Current employee's own scorecard (read-only)
router.get('/scorecard', (req, res) => {
  const sc = loadScorecard(req.user.id);
  if (!sc) return res.json({ scorecard: null, scores: [] });

  res.json({ scorecard: sc, scores: sc.scores, weighted_pct: weightedPct(sc.scores) });
});

module.exports = router;