const db = require('./database');

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
    SELECT s.parameter_id, s.score, p.name, p.description, p.weightage
    FROM scores s
    JOIN parameters p ON p.id = s.parameter_id
    WHERE s.scorecard_id = ?
  `).all(sc.id);

  return { ...sc, scores };
}

module.exports = { weightedPct, loadScorecard };