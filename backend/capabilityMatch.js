const HIRING_PHRASES = [
  'tally prime','tally erp','ms excel','ms office','advanced excel','payment gateway','accounts payable','accounts receivable','gst filing','bank reconciliation','financial reporting','chartered accountant','cost accountant',
  'react js','node js','next js','machine learning','data science','project management','business analyst','human resource','digital marketing',
];

const HIRING_VOCAB = new Set([
  ...HIRING_PHRASES,
  'communication','english','articulation','presentation','interpersonal','written','spoken','clarity',
  'technical','accounting','tally','sap','excel','erp','gst','payable','receivable','reconciliation','audit','taxation','bookkeeping','ledger','voucher','balance','sheet','profit','loss','trial','compliance','invoicing','billing','payroll','tallyprime',
  'software','tools','java','python','javascript','react','node','sql','oracle','powerbi','tableau','html','css','aws','azure','docker','kubernetes',
  'problem','solving','analytical','analysis','solution','troubleshoot','critical','thinking','reasoning','judgement',
  'attitude','positive','motivation','proactive','enthusiasm',
  'teamwork','collaboration','cooperation','team',
  'adaptability','adapt','flexible','versatile','agile','resilience','change',
  'experience','relevant','exposure','background','domain','finance','industry','sector','fresher',
  'education','degree','bcom','mcom','bba','mba','ca','cs','cma','bachelor','master','graduate','postgraduate','12th','inter','certification','diploma','qualification',
  'cultural','culture','values','ethics','alignment',
  'leadership','leader','manage','management','mentor','ownership','supervise',
  'urgency','availability','notice','immediate','joining','available',
  'growth','learning','mindset','curiosity','development','upskill','training',
  'reliability','reliable','dependable','consistent','punctual','trustworthy','discipline',
  'client','customer','stakeholder','service','requirement',
  'salary','compensation','ctc','package','expectation','remuneration','lpa','lakh',
  'interview','confidence','demeanor','presence',
  'initiative','self','direction','independent','drive',
  'professionalism','professional','integrity','decorum','ethics','poise',
  'schedule','flexibility','shift','timing','overtime','flexible',
  'overall','holistic','general',
]);

const STOPWORDS = new Set(['and','the','with','for','a','an','to','of','in','on','years','year','work','skill','skills','ability','knowledge','using','will','are','is','be','have','has','had','this','that','from','you','your','our','their','they','them','we','us','as','at','by','it','or','if','so','but','not','can','more','most','such','than','also','been','being','was','were','per','via','etc','required','preferred','minimum','maximum','should','must','able','good','strong','excellent']);

function normalize(text) {
  return String(text||'').toLowerCase().replace(/[^a-z0-9\s+.#/-]/g,' ').replace(/\s+/g,' ').trim();
}

function extractHiringSignals(text) {
  if (!text) return [];
  const lower = normalize(text);
  const found = new Set();
  for (const phrase of HIRING_PHRASES) {
    if (lower.includes(phrase)) found.add(phrase);
  }
  const tokens = lower.match(/[a-z][a-z+#.]{2,}/g) || [];
  for (const t of tokens) {
    const clean = t.replace(/^[.#]+|[.#]+$/g,'');
    if (clean.length < 3) continue;
    if (STOPWORDS.has(clean)) continue;
    if (HIRING_VOCAB.has(clean)) found.add(clean);
  }
  return [...found];
}

function extractKeywords(text) {
  return extractHiringSignals(text);
}

function extractJDSections(text) {
  const lower = normalize(text);
  const signals = extractHiringSignals(text);
  const cats = { skills:[], education:[], experience:[], tools:[], soft:[] };
  const skillSet = new Set(['technical','accounting','tally','sap','excel','erp','gst','payable','receivable','audit','taxation','bookkeeping','ledger','java','python','javascript','react','node','sql','oracle','powerbi','tableau','html','css','aws','tallyprime','bookkeeping','reconciliation','invoicing','billing','payroll','compliance']);
  const eduSet = new Set(['bcom','mcom','bba','mba','ca','cs','cma','bachelor','master','graduate','postgraduate','degree','diploma','certification','12th','inter','education','qualification']);
  const toolSet = new Set(['excel','tally','tallyprime','sap','erp','oracle','powerbi','tableau','ms','tally','software','tools','aws','azure','docker']);
  const softSet = new Set(['communication','presentation','interpersonal','teamwork','collaboration','leadership','adaptability','problem','analytical','attitude','initiative','professionalism','cultural','reliability','discipline']);
  for (const s of signals) {
    const base = s.split(' ')[0];
    if (eduSet.has(s) || eduSet.has(base)) cats.education.push(s);
    else if (toolSet.has(s) || toolSet.has(base)) cats.tools.push(s);
    else if (skillSet.has(s) || skillSet.has(base)) cats.skills.push(s);
    else if (softSet.has(s) || softSet.has(base)) cats.soft.push(s);
    else cats.skills.push(s);
  }
  const expMatch = lower.match(/(\d+)\s*\+?\s*(years|yrs|exp)/g);
  if (expMatch) cats.experience = expMatch.map(m=>m.trim());
  return cats;
}

function matchResumeToJD(jdText, resumeText) {
  const jdSignals = extractHiringSignals(jdText);
  const resumeSet = new Set(extractHiringSignals(resumeText));
  const matched = jdSignals.filter(k => resumeSet.has(k) || resumeSet.has(k.split(' ')[0]));
  const missing = jdSignals.filter(k => !resumeSet.has(k) && !resumeSet.has(k.split(' ')[0]));
  const pct = jdSignals.length ? Math.round((matched.length / jdSignals.length) * 100) : 0;
  const jdCats = extractJDSections(jdText);
  const detailCats = {};
  for (const [cat, list] of Object.entries(jdCats)) {
    detailCats[cat] = { required: list, matched: list.filter(k=> resumeSet.has(k) || resumeSet.has(k.split(' ')[0])), missing: list.filter(k=> !resumeSet.has(k) && !resumeSet.has(k.split(' ')[0])) };
  }
  return { pct, matched, missing, jdKeywords: jdSignals, jdSignals, categories: detailCats, hiringSignals: jdSignals };
}

module.exports = { extractKeywords, extractHiringSignals, extractJDSections, matchResumeToJD, HIRING_VOCAB, HIRING_PHRASES };
