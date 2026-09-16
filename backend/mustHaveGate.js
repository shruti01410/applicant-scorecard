function checkMustHaves(jdAnalysis, evidenceResults) {
  if (!jdAnalysis || !jdAnalysis.mustHaves) return { passed: true, results: [], criticalGaps: [] };

  const results = [];
  const criticalGaps = [];

  for (const req of jdAnalysis.mustHaves) {
    const evidence = evidenceResults.find(e => e.term === req.term || e.requirement === req.text);
    const met = evidence && evidence.hasEvidence && evidence.score >= 40;
    const severity = req.category === 'experience' || req.category === 'education' ? 'critical' : 'important';

    results.push({
      requirement: req.text,
      term: req.term,
      category: req.category,
      met,
      evidence: evidence ? (evidence.evidence || []).map(e => e.text) : [],
      severity,
      confidence: evidence ? evidence.confidence : 0,
    });

    if (!met && severity === 'critical') {
      criticalGaps.push({
        requirement: req.text,
        category: req.category,
        message: `Critical gap: "${req.text}" evidence not found in resume`,
      });
    }
  }

  const allMet = results.every(r => r.met);
  const criticalMet = results.filter(r => r.severity === 'critical').every(r => r.met);

  return {
    passed: allMet,
    criticalPassed: criticalMet,
    totalRequired: results.length,
    totalMet: results.filter(r => r.met).length,
    results,
    criticalGaps,
  };
}

function storeMustHaveResults(db, scorecardId, jdId, mustHaveCheck) {
  const insert = db.prepare(
    'INSERT INTO must_have_results (scorecard_id, jd_id, requirement_text, met, evidence, severity) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const r of mustHaveCheck.results) {
    insert.run(scorecardId, jdId || null, r.requirement, r.met ? 1 : 0, JSON.stringify(r.evidence), r.severity);
  }
}

function getMustHaveResults(db, scorecardId) {
  return db.prepare('SELECT * FROM must_have_results WHERE scorecard_id = ? ORDER BY id').all(scorecardId);
}

module.exports = { checkMustHaves, storeMustHaveResults, getMustHaveResults };
