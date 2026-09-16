const { extractKeywords } = require('./capabilityMatch');
const numer = require('./numerologyUtils');
const { analyzeJD } = require('./jdAnalyzer');
const { extractEvidence } = require('./evidenceExtractor');
const { mapEvidenceToParameters, applyJDWeights, computeWeightedPct, applyNumerologyBonus, computeConfidence } = require('./scoreEngine');
const { checkMustHaves, storeMustHaveResults } = require('./mustHaveGate');

// Keyword lists for auto-rateable parameters only
const PARAM_KEYWORDS = {
  2: ['technical','excel','tally','sap','accounting','software','tools','domain','erp','gst','tallyprime','quickbooks','power','bi','sql','python','java','cloud','aws','azure'],
  3: ['problem','solving','analytical','analysis','solution','troubleshoot','critical','thinking','debug','resolve','fix'],
  6: ['adaptability','adapt','flexible','versatile','change','agile','resilience','dynamic','multi-task'],
  7: ['experience','relevant','exposure','background','years','track','worked','handled','managed','role'],
  8: ['education','degree','bcom','mcom','ca','mba','certification','qualification','graduate','bachelor','master','diploma','university'],
  10: ['leadership','leader','potential','manage','management','mentor','ownership','supervise','oversee','lead','team lead'],
  12: ['growth','learning','mindset','improve','curiosity','development','upskill','train','course','certify'],
  13: ['reliability','reliable','dependable','consistent','punctual','trustworthy','discipline','deadline','on time'],
  15: ['industry','knowledge','domain','sector','accounts','payable','receivable','finance','manufacturing','retail','banking','insurance'],
  18: ['presentation','present','public','speaking','slides','demo','workshop','training'],
  19: ['analytical','analysis','data','reasoning','judgement','insight','numbers','report','dashboard','forecast'],
  20: ['initiative','proactive','self','direction','ownership','drive','independent','self starter','autonomous'],
  21: ['professionalism','professional','ethics','punctual','poise','integrity','decorum','compliance','code of conduct'],
};

// Parameters that are purely behavioral/manual — cannot be measured from JD+resume text
// These ALWAYS default to 3 (Average) and must be rated manually by the recruiter
const MANUAL_ONLY_PARAMS = new Set([1, 4, 5, 9, 11, 14, 16, 17, 22, 23]);

// Enhanced keyword context: multi-word phrases and semantic hints
const PARAM_CONTEXT = {
  2: { phrases: ['ms excel','tally prime','sap fico','quickbooks','power bi','sql server','advanced excel','data entry'], roleBoost: { accounts: 0.5, tech: 0.3 } },
  3: { phrases: ['root cause','troubleshoot','debug','issue resolution','root cause analysis','critical thinking'], roleBoost: { tech: 0.5 } },
  6: { phrases: ['fast paced','change management','multiple projects','wearing multiple hats','quick learner'], roleBoost: {} },
  7: { phrases: ['years of experience','worked as','handled','managed','responsibilities include','key achievements'], roleBoost: { accounts: 0.3, tech: 0.3 } },
  8: { phrases: ['bachelor of','master of','b.com','m.com','mba','ca inter','completed','university of','institute of'], roleBoost: {} },
  10: { phrases: ['team lead','project manager','managed team','supervised','oversaw','mentored','training'], roleBoost: {} },
  12: { phrases: ['certified','completed course','attended workshop','self learning','online course','upskilled'], roleBoost: {} },
  13: { phrases: ['met deadlines','delivered on time','consistent performance','reliable','dependable'], roleBoost: {} },
  15: { phrases: ['accounts payable','accounts receivable','financial reporting','gst filing','audit','tax','manufacturing sector','banking sector'], roleBoost: { accounts: 0.5 } },
  18: { phrases: ['delivered presentation','conducted training','client presentation','demo','workshop'], roleBoost: {} },
  19: { phrases: ['data analysis','financial analysis','report generation','dashboard','forecast','variance analysis'], roleBoost: { accounts: 0.3, tech: 0.3 } },
  20: { phrases: ['self starter','independently','proactively','took ownership','initiated','started'], roleBoost: {} },
  21: { phrases: ['code of conduct','compliance','professional standards','ethical','integrity','confidentiality'], roleBoost: {} },
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
  const isAccountsRole = /account|payable|receivable|tally|gst|finance|audit|tax|compliance/.test(titleLower);
  const isTechRole = /technical|software|developer|engineer|it|data|analyst/.test(titleLower);
  const roleType = isAccountsRole ? 'accounts' : isTechRole ? 'tech' : null;

  const scores = [];
  for (let id = 1; id <= 23; id++) {
    // Manual-only parameters: always default to 3
    if (MANUAL_ONLY_PARAMS.has(id)) {
      scores.push({
        parameter_id: id,
        score: 3,
        detail: { baseScore: 3, relevant: 'manual', matched: 'recruiter must rate', numerologyBonus: 0, roleBonus: 0, manual: true },
      });
      continue;
    }

    // Auto-rateable parameters: score from JD + resume text
    const kws = PARAM_KEYWORDS[id] || [];
    const context = PARAM_CONTEXT[id] || {};
    const phrases = context.phrases || [];

    // Find relevant keywords in JD
    const relevantKws = kws.filter(k => jdLower.includes(k) || jdKeywords.has(k));
    const relevantPhrases = phrases.filter(p => jdLower.includes(p));
    const allRelevant = [...new Set([...relevantKws, ...relevantPhrases])];

    // Find matched keywords in resume
    const matchedKws = relevantKws.filter(k => resumeLower.includes(k) || resumeKeywords.has(k));
    const matchedPhrases = relevantPhrases.filter(p => resumeLower.includes(p));
    const allMatched = [...new Set([...matchedKws, ...matchedPhrases])];

    let baseScore;
    if (allRelevant.length === 0) {
      // JD doesn't mention this skill at all — use resume evidence only
      const resumeHits = kws.filter(k => resumeLower.includes(k) || resumeKeywords.has(k));
      const resumePhraseHits = phrases.filter(p => resumeLower.includes(p));
      const totalResumeHits = resumeHits.length + resumePhraseHits.length;
      if (totalResumeHits >= 3) baseScore = 4;
      else if (totalResumeHits >= 1) baseScore = 3;
      else baseScore = 3; // No data → default 3
    } else {
      // JD mentions it AND resume has evidence
      const ratio = allMatched.length / allRelevant.length;
      if (ratio >= 0.7) baseScore = 5;
      else if (ratio >= 0.4) baseScore = 4;
      else if (ratio >= 0.2) baseScore = 3;
      else if (allMatched.length > 0) baseScore = 3;
      else baseScore = 2; // JD requires it but resume doesn't show it
    }

    // Role-type bonus
    let roleBonus = 0;
    if (roleType && context.roleBoost) {
      roleBonus = context.roleBoost[roleType] || 0;
    }

    // Numerology bonus
    let numerologyBonus = 0;
    if (effectiveLifePath != null) {
      const nameMap = { 2:'Technical Skills',3:'Problem Solving',6:'Adaptability',7:'Experience Relevance',8:'Education & Certifications',10:'Leadership Potential',12:'Growth Mindset',13:'Reliability',15:'Industry Knowledge',18:'Presentation Skills',19:'Analytical Abilities',20:'Initiative',21:'Professionalism' };
      const pname = nameMap[id];
      const paramNum = pname && numer.PARAM_NUMEROLOGY ? numer.PARAM_NUMEROLOGY[pname] : null;
      if (paramNum) {
        const normLife = effectiveLifePath > 9 ? numer.reduceDigits(effectiveLifePath, { keepMaster: false }) : effectiveLifePath;
        const diff = Math.abs(paramNum - normLife);
        if (diff === 0) numerologyBonus = 0.5;
        else if (diff === 1) numerologyBonus = 0.3;
        else if (diff >= 4) numerologyBonus = -0.3;
      }
    }

    let finalScore = baseScore + roleBonus + numerologyBonus;
    finalScore = Math.max(1, Math.min(5, Math.round(finalScore)));

    scores.push({
      parameter_id: id,
      score: finalScore,
      detail: {
        baseScore,
        relevant: allRelevant.length ? allRelevant.join(', ') : 'resume evidence',
        matched: allMatched.length ? allMatched.join(', ') : 'none',
        numerologyBonus: Math.round(numerologyBonus * 10) / 10,
        roleBonus,
        manual: false,
      },
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

module.exports = { autoRateParameters, autoRateEnhanced, PARAM_KEYWORDS, MANUAL_ONLY_PARAMS };
