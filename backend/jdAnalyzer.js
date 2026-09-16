const { extractStructured } = require('./capabilityMatch');

function analyzeJD(jdText) {
  if (!jdText) return { requirements: [], mustHaves: [], niceToHaves: [], skills: [], experience: [], education: [], tools: [] };

  const entities = extractStructured(jdText, { jd: true });

  const requirements = entities.map(e => ({
    text: e.display,
    term: e.term,
    category: e.category,
    importance: e.mode === 'preferred' ? 'preferred' : 'required',
    confidence: e.confidence,
    context: e.context || '',
  }));

  const mustHaves = requirements.filter(r => r.importance === 'required');
  const niceToHaves = requirements.filter(r => r.importance === 'preferred');
  const skills = requirements.filter(r => r.category === 'technical' || r.category === 'tools');
  const experience = requirements.filter(r => r.category === 'experience');
  const education = requirements.filter(r => r.category === 'education');
  const tools = requirements.filter(r => r.category === 'tools');

  const experienceRe = /(\d{1,2})\s*(?:[-+]|to)\s*(\d{1,2})\s*(?:years?|yrs)|(\d{1,2})\s*\+?\s*(?:years?|yrs)/gi;
  let expMatch;
  const requiredYears = [];
  while ((expMatch = experienceRe.exec(jdText)) !== null) {
    if (expMatch[1] && expMatch[2]) requiredYears.push({ min: parseInt(expMatch[1]), max: parseInt(expMatch[2]) });
    else if (expMatch[3]) requiredYears.push({ min: parseInt(expMatch[3]), max: Infinity });
  }

  return {
    requirements,
    mustHaves,
    niceToHaves,
    skills,
    experience,
    education,
    tools,
    requiredYears,
    totalRequirements: requirements.length,
    requiredCount: mustHaves.length,
    preferredCount: niceToHaves.length,
  };
}

function storeRequirements(db, jdId, requirements) {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM jd_requirements WHERE jd_id = ?').get(jdId);
  if (existing.c > 0) return;

  const insert = db.prepare(
    'INSERT INTO jd_requirements (jd_id, requirement_text, category, importance, skill_term) VALUES (?, ?, ?, ?, ?)'
  );
  for (const r of requirements) {
    insert.run(jdId, r.text, r.category, r.importance, r.term);
  }
}

module.exports = { analyzeJD, storeRequirements };
