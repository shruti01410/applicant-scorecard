const { PARAM_KEYWORDS } = require('./autoRate');
const numer = require('./numerologyUtils');

const DEFAULT_CATEGORY_WEIGHTS = {
  skills: 30,
  experience: 20,
  tools: 15,
  education: 10,
  soft: 10,
  domain: 10,
  other: 5,
};

function computeConfidence(evidenceItems) {
  if (!evidenceItems || evidenceItems.length === 0) return 0.1;
  const avgConf = evidenceItems.reduce((sum, e) => sum + (e.confidence || 0.5), 0) / evidenceItems.length;
  const countBonus = Math.min(0.2, evidenceItems.length * 0.04);
  const strongCount = evidenceItems.filter(e => e.strength === 'strong').length;
  const strongBonus = strongCount > 0 ? Math.min(0.15, strongCount * 0.05) : 0;
  return Math.min(0.99, Math.round((avgConf + countBonus + strongBonus) * 100) / 100);
}

function confidenceLabel(conf) {
  if (conf >= 0.8) return 'High';
  if (conf >= 0.5) return 'Medium';
  return 'Low';
}

function mapEvidenceToParameters(evidenceResults, jdAnalysis) {
  const paramScores = [];
  for (let id = 1; id <= 23; id++) {
    const kws = PARAM_KEYWORDS[id] || [];
    const matchingEvidence = evidenceResults.filter(e => {
      const termLower = (e.term || '').toLowerCase();
      const textLower = (e.requirement || '').toLowerCase();
      return kws.some(k => termLower.includes(k) || textLower.includes(k) || k.includes(termLower));
    });

    if (matchingEvidence.length === 0) {
      paramScores.push({
        parameter_id: id,
        score: 3,
        confidence: 0.3,
        evidence: [{ type: 'default', text: 'No specific evidence found', strength: 'none', confidence: 0.3 }],
        reason: 'No direct evidence found in resume for this parameter',
      });
      continue;
    }

    const avgScore = matchingEvidence.reduce((s, e) => s + e.score, 0) / matchingEvidence.length;
    const mappedScore = Math.max(1, Math.min(5, Math.round(avgScore / 25 + 1)));
    const combinedEvidence = matchingEvidence.flatMap(e => e.evidence || []);
    const combinedConf = computeConfidence(combinedEvidence);

    const hasStrong = combinedEvidence.some(e => e.strength === 'strong');
    const hasModerate = combinedEvidence.some(e => e.strength === 'moderate');
    const strongCount = combinedEvidence.filter(e => e.strength === 'strong').length;

    let reason;
    if (strongCount >= 2) reason = `Strong evidence found across ${strongCount} sources`;
    else if (hasStrong) reason = 'Strong direct evidence found in resume';
    else if (hasModerate) reason = 'Moderate evidence found; could benefit from more detail';
    else reason = 'Limited evidence found';

    paramScores.push({
      parameter_id: id,
      score: mappedScore,
      confidence: combinedConf,
      evidence: combinedEvidence.slice(0, 8),
      reason,
    });
  }
  return paramScores;
}

function applyJDWeights(paramScores, jdId, db) {
  if (!db || !jdId) return paramScores;

  const overrides = db.prepare('SELECT parameter_id, weightage FROM jd_weight_overrides WHERE jd_id = ?').all(jdId);
  if (overrides.length === 0) return paramScores;

  const overrideMap = new Map(overrides.map(o => [o.parameter_id, o.weightage]));
  const defaultWeights = db.prepare('SELECT id, weightage FROM parameters ORDER BY id').all();
  const defaultMap = new Map(defaultWeights.map(p => [p.id, p.weightage]));

  return paramScores.map(p => ({
    ...p,
    original_weight: defaultMap.get(p.parameter_id) || 5,
    jd_weight: overrideMap.get(p.parameter_id) || defaultMap.get(p.parameter_id) || 5,
  }));
}

function computeWeightedPct(paramScores, jdId, db) {
  const scored = paramScores.filter(p => p.score > 0);
  if (scored.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const p of scored) {
    const weight = p.jd_weight || p.original_weight || 5;
    totalWeight += weight;
    weightedSum += (p.score / 5) * weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;
}

function applyNumerologyBonus(paramScores, candidateName, lifePath) {
  const nameNum = candidateName ? numer.nameNumber(candidateName) : null;
  const effectiveLifePath = lifePath != null ? lifePath : nameNum;
  if (effectiveLifePath == null) return paramScores;

  return paramScores.map(p => {
    const nameMap = {
      1:'Communication',2:'Technical Skills',3:'Problem Solving',4:'Attitude',5:'Teamwork',
      6:'Adaptability',7:'Experience Relevance',8:'Education & Certifications',9:'Cultural Fit',
      10:'Leadership Potential',11:'Urgency / Availability',12:'Growth Mindset',13:'Reliability',
      14:'Client-Specific Skills',15:'Industry Knowledge',16:'Salary Expectations',
      17:'Interview Performance',18:'Presentation Skills',19:'Analytical Abilities',
      20:'Initiative',21:'Professionalism',22:'Schedule Flexibility',23:'Overall Impression'
    };
    const paramNum = numer.PARAM_NUMEROLOGY ? numer.PARAM_NUMEROLOGY[nameMap[p.parameter_id]] : null;
    if (!paramNum) return p;

    const normLife = effectiveLifePath > 9 ? numer.reduceDigits(effectiveLifePath, { keepMaster: false }) : effectiveLifePath;
    const diff = Math.abs(paramNum - normLife);
    let bonus = 0;
    if (diff === 0) bonus = 0.5;
    else if (diff === 1) bonus = 0.3;
    else if (diff >= 4) bonus = -0.3;

    const newScore = Math.max(1, Math.min(5, Math.round(p.score + bonus)));
    return { ...p, score: newScore, numerologyBonus: bonus };
  });
}

module.exports = {
  computeConfidence,
  confidenceLabel,
  mapEvidenceToParameters,
  applyJDWeights,
  computeWeightedPct,
  applyNumerologyBonus,
  DEFAULT_CATEGORY_WEIGHTS,
};
