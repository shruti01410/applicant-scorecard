const { extractKeywords } = require('./capabilityMatch');
const numer = require('./numerologyUtils');
const { analyzeJD } = require('./jdAnalyzer');
const { extractEvidence } = require('./evidenceExtractor');
const { mapEvidenceToParameters, applyJDWeights, computeWeightedPct, applyNumerologyBonus, computeConfidence } = require('./scoreEngine');
const { checkMustHaves, storeMustHaveResults } = require('./mustHaveGate');

const PARAM_KEYWORDS = {
  1: ['communication','english','articulation','clarity','presentation','interpersonal','spoken','written'],
  2: ['technical','excel','tally','sap','accounting','software','tools','domain','erp','gst','tallyprime'],
  3: ['problem','solving','analytical','analysis','solution','troubleshoot','critical','thinking'],
  4: ['attitude','positive','enthusiasm','motivation','engagement','optimism','proactive'],
  5: ['teamwork','team','collaboration','cooperation','collective','interpersonal'],
  6: ['adaptability','adapt','flexible','versatile','change','agile','resilience'],
  7: ['experience','relevant','exposure','background','years','track'],
  8: ['education','degree','bcom','mcom','ca','mba','certification','qualification','graduate'],
  9: ['cultural','culture','values','ethics','fit','alignment','mission'],
  10: ['leadership','leader','potential','manage','management','mentor','ownership'],
  11: ['urgency','availability','notice','immediate','joining','available','join'],
  12: ['growth','learning','mindset','improve','curiosity','development','upskill'],
  13: ['reliability','reliable','dependable','consistent','punctual','trustworthy','discipline'],
  14: ['client','customer','specific','requirement','stakeholder','service'],
  15: ['industry','knowledge','domain','sector','accounts','payable','receivable','finance'],
  16: ['salary','compensation','ctc','expectation','package','remuneration'],
  17: ['interview','performance','confidence','demeanor','presence','articulate'],
  18: ['presentation','present','public','speaking','slides','demo'],
  19: ['analytical','analysis','data','reasoning','judgement','insight','numbers'],
  20: ['initiative','proactive','self','direction','ownership','drive','independent'],
  21: ['professionalism','professional','ethics','punctual','poise','integrity','decorum'],
  22: ['schedule','flexibility','flexible','shift','timing','availability','overtime'],
  23: ['overall','impression','holistic','general','overall','comprehensive'],
};

function autoRateParameters({ jdText, resumeText, candidateName, jobTitle, lifePath }) {
  const jdLower = String(jdText || '').toLowerCase();
  const resumeLower = String(resumeText || '').toLowerCase();
  const { extractHiringSignals } = require('./capabilityMatch');
  const jdKeywords = new Set(extractHiringSignals(jdText || ''));
  const resumeKeywords = new Set(extractHiringSignals(resumeText || ''));
  const nameNum = candidateName ? numer.nameNumber(candidateName) : null;
  const effectiveLifePath = lifePath != null ? lifePath : nameNum;

  const titleLower = String(jobTitle || '').toLowerCase();
  const isAccountsRole = /account|payable|tally|gst|finance/.test(titleLower);
  const isTechRole = /technical|software|developer|engineer|it/.test(titleLower);

  const scores = [];
  for (let id = 1; id <= 23; id++) {
    const kws = PARAM_KEYWORDS[id] || [];
    const relevant = kws.filter(k => jdLower.includes(k) || jdKeywords.has(k));
    let baseScore;
    if (relevant.length === 0) {
      baseScore = 3;
    } else {
      const matched = relevant.filter(k => resumeLower.includes(k) || resumeKeywords.has(k)).length;
      const ratio = matched / relevant.length;
      if (ratio >= 0.8) baseScore = 5;
      else if (ratio >= 0.5) baseScore = 4;
      else if (ratio >= 0.25) baseScore = 3;
      else if (matched > 0) baseScore = 2;
      else baseScore = 1;
    }

    let roleBonus = 0;
    if (isAccountsRole && [2,15,7,13].includes(id) && baseScore < 5) roleBonus = 0.5;
    if (isTechRole && [2,3,19].includes(id) && baseScore < 5) roleBonus = 0.5;

    let numerologyBonus = 0;
    if (effectiveLifePath != null) {
      const paramNum = numer.PARAM_NUMEROLOGY ? numer.PARAM_NUMEROLOGY[Object.keys(numer.PARAM_NUMEROLOGY).find(k => Number(k) === id) ? '' : ''] : null;
      const paramNumByName = (() => {
        const nameMap = {
          1:'Communication',2:'Technical Skills',3:'Problem Solving',4:'Attitude',5:'Teamwork',6:'Adaptability',7:'Experience Relevance',8:'Education & Certifications',9:'Cultural Fit',10:'Leadership Potential',11:'Urgency / Availability',12:'Growth Mindset',13:'Reliability',14:'Client-Specific Skills',15:'Industry Knowledge',16:'Salary Expectations',17:'Interview Performance',18:'Presentation Skills',19:'Analytical Abilities',20:'Initiative',21:'Professionalism',22:'Schedule Flexibility',23:'Overall Impression'
        };
        const pname = nameMap[id];
        return numer.PARAM_NUMEROLOGY ? numer.PARAM_NUMEROLOGY[pname] : null;
      })();
      if (paramNumByName) {
        const normLife = effectiveLifePath > 9 ? numer.reduceDigits(effectiveLifePath, { keepMaster: false }) : effectiveLifePath;
        const diff = Math.abs(paramNumByName - normLife);
        if (diff === 0) numerologyBonus = 0.7;
        else if (diff === 1) numerologyBonus = 0.4;
        else if (diff >= 4) numerologyBonus = -0.4;
      }
    }

    let finalScore = baseScore + roleBonus + numerologyBonus;
    finalScore = Math.max(1, Math.min(5, Math.round(finalScore)));
    const relevantStr = relevant.length ? relevant.join(', ') : 'general';
    const matchedStr = relevant.filter(k => resumeLower.includes(k) || resumeKeywords.has(k)).join(', ') || 'none';
    scores.push({
      parameter_id: id,
      score: finalScore,
      detail: { baseScore, relevant: relevantStr, matched: matchedStr, numerologyBonus: Math.round(numerologyBonus*10)/10, roleBonus },
    });
  }
  return scores;
}

function autoRateEnhanced({ jdText, resumeText, candidateName, jobTitle, lifePath, jdId, db }) {
  const jdAnalysis = analyzeJD(jdText);
  const evidenceResults = extractEvidence(resumeText, jdAnalysis.requirements);
  const mustHaveCheck = checkMustHaves(jdAnalysis, evidenceResults);
  let paramScores = mapEvidenceToParameters(evidenceResults, jdAnalysis);
  paramScores = applyJDWeights(paramScores, jdId, db);
  paramScores = applyNumerologyBonus(paramScores, candidateName, lifePath);

  const pct = computeWeightedPct(paramScores, jdId, db);
  const overallConfidence = computeConfidence(paramScores.flatMap(p => p.evidence || []));

  return {
    paramScores,
    weightedPct: pct,
    overallConfidence,
    mustHaveCheck,
    jdAnalysis: {
      totalRequirements: jdAnalysis.totalRequirements,
      requiredCount: jdAnalysis.requiredCount,
      preferredCount: jdAnalysis.preferredCount,
    },
    evidenceResults,
  };
}

module.exports = { autoRateParameters, autoRateEnhanced, PARAM_KEYWORDS };
