const { extractStructured, extractEntities, extractCandidateProfile } = require('./capabilityMatch');
const { buildResumeSections, labelForSentence, recencyFor } = require('./resumeContext');

const SOP_PARAM_META = {
  101: { name: 'Communication & Influence', weight: 12, grp: 'PERSON' },
  102: { name: 'Problem Solving & Analytical Thinking', weight: 14, grp: 'PERSON' },
  103: { name: 'Judgment & Decision-Making', weight: 12, grp: 'PERSON' },
  104: { name: 'Collaboration & Teamwork', weight: 10, grp: 'PERSON' },
  105: { name: 'Adaptability, Agility & Resilience', weight: 10, grp: 'PERSON' },
  106: { name: 'Initiative & Drive', weight: 10, grp: 'PERSON' },
  107: { name: 'Learning & Growth Orientation', weight: 8, grp: 'PERSON' },
  108: { name: 'Leadership Potential', weight: 8, grp: 'PERSON' },
  109: { name: 'Reliability & Professionalism', weight: 8, grp: 'PERSON' },
  110: { name: 'Values & Work-Environment Alignment', weight: 8, grp: 'PERSON' },
  111: { name: 'Technical / Role Competence', weight: 50, grp: 'ROLE' },
  112: { name: 'Experience & Industry Relevance', weight: 30, grp: 'ROLE' },
  113: { name: 'Qualifications & Certifications', weight: 20, grp: 'ROLE' },
};

const STRONG_ACTIONS = /built|developed|implemented|created|led|presented|facilitated|negotiated|delivered|managed|spearheaded|initiated|resolved|optimized|automated|designed|taught|trained|mentored|coordinated|piloted|founded|reduced|improved|increased|saved|refactored/;
const MODERATE_ACTIONS = /collaborated|worked with|responsible for|handled|intern|project|participated|supported|assisted|involved|contributed|session|workshop|demo|conducted|organized/;

const PERSON_RULES = {
  101: {
    terms: ['communication', 'communicate', 'presented', 'presentation', 'presentations', 'public speaking', 'slides', 'demo', 'workshop', 'training', 'persuasive', 'negotiat', 'articulate', 'storytelling', 'client presentation', 'pitched', 'convincing'],
  },
  102: {
    terms: ['problem solving', 'analytical', 'analysis', 'solution', 'troubleshoot', 'critical thinking', 'debug', 'resolve', 'fix', 'root cause', 'data-driven', 'logical'],
  },
  103: {
    terms: ['decision', 'judgment', 'judgement', 'prioritiz', 'evaluate', 'assess', 'trade-off', 'reasoning', 'data-driven', 'sound judgment', 'weighted decision'],
  },
  104: {
    terms: ['team', 'collaborat', 'cross-functional', 'stakeholder', 'partner', 'facilitat', 'coordinate', 'group', 'worked with'],
  },
  105: {
    terms: ['adapt', 'flexible', 'versatile', 'change', 'agile', 'resilience', 'dynamic', 'multi-task', 'fast paced', 'rapidly changing', 'thrive under pressure'],
  },
  106: {
    terms: ['initiative', 'proactive', 'self-starter', 'ownership', 'drive', 'independent', 'autonomous', 'initiated', 'proactively', 'self-motivated'],
  },
  107: {
    terms: ['learning', 'growth mindset', 'improve', 'curiosity', 'upskill', 'course', 'certified', 'certification', 'willing to learn', 'continuous learning', 'attend'],
  },
  108: {
    terms: ['leadership', 'leader', 'mentor', 'supervise', 'oversee', 'team lead', 'managed team', 'lead', 'guid', 'management'],
  },
  109: {
    terms: ['reliable', 'dependable', 'consistent', 'punctual', 'trustworthy', 'discipline', 'deadline', 'on time', 'professional', 'integrity', 'confidentiality', 'accuracy'],
  },
  110: {
    terms: ['values', 'integrity', 'ethics', 'culture', 'mission', 'work ethic', 'respectful', 'collaboration', 'diversity', 'aligned'],
  },
};

function cap(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function sentenceSplit(text) {
  const t = String(text || '');
  if (!t.trim()) return [];
  return t.split(/[.!?\n]+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 3);
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function classifyStrength(sentence) {
  const s = ' ' + sentence.toLowerCase() + ' ';
  if (STRONG_ACTIONS.test(s)) return 'strong';
  if (MODERATE_ACTIONS.test(s)) return 'moderate';
  return 'weak';
}

function evidenceItem(strength) {
  const map = { strong: 0.82, moderate: 0.66, weak: 0.5 };
  return { confidence: map[strength] || 0.5, strength };
}

function evaluatePerson(rule, id, jdLower, sentences) {
  const meta = SOP_PARAM_META[id];
  const terms = rule.terms;
  const res = { strong: [], moderate: [], weak: [] };
  for (const sentence of sentences) {
    const sl = sentence.toLowerCase();
    if (!terms.some((t) => sl.includes(t))) continue;
    const st = classifyStrength(sentence);
    if (res[st].length >= 3) continue;
    res[st].push(sentence);
  }
  const strong = res.strong.length;
  const moderate = res.moderate.length;
  const weak = res.weak.length;
  const jdRequiredTerms = terms.filter((t) => jdLower.includes(t));
  const hasEvidence = strong + moderate + weak > 0;
  const jdExpected = jdRequiredTerms.length > 0;

  let score = null;
  let status = 'not_scored';
  let conf = 0.5;
  if (!hasEvidence) {
    if (jdExpected) {
      score = 35;
      status = 'active';
      conf = 0.35;
    }
  } else {
    status = 'active';
    if (strong >= 3) score = 86;
    else if (strong === 2) score = 74;
    else if (strong === 1) score = 62;
    else if (moderate >= 3) score = 66;
    else if (moderate === 2) score = 57;
    else if (moderate === 1) score = 50;
    else if (weak >= 2) score = 48;
    else score = 40;
    const top = strong > 0 ? 'strong' : moderate > 0 ? 'moderate' : 'weak';
    conf = evidenceItem(top).confidence + 0.05 * Math.min(3, res[top].length);
    if (jdExpected) {
      score = Math.min(92, score + 6);
      conf = Math.min(0.95, conf + 0.05);
    } else {
      conf = Math.max(0.35, conf - 0.15);
    }
    conf = Math.round(conf * 100) / 100;
  }

  const evidence = [];
  const gaps = [];
  if (hasEvidence) {
    const order = [...res.strong.slice(0, 2), ...res.moderate.slice(0, 2), ...res.weak.slice(0, 1)];
    for (const s of order) {
      evidence.push({ source: 'resume', strength: classifyStrength(s), text: '"' + s.slice(0, 140) + '"' });
    }
    if (strong === 0 && moderate === 0 && weak > 0) {
      gaps.push('Evidence is weak (single mentions). Confirm via behavioral interview.');
    }
  } else if (jdExpected) {
    gaps.push(`JD expects ${meta.name} but the resume contains no supporting evidence.`);
  }

  return {
    parameter_id: id,
    name: meta.name,
    weight: meta.weight,
    grp: meta.grp,
    score: score == null ? null : Math.round(score),
    status,
    confidence: score == null ? null : conf,
    evidence,
    gaps,
    reason: hasEvidence ? (jdExpected ? `JD+resume matched ${jdRequiredTerms.length} signal(s); evidence tier strong=${strong} moderate=${moderate} weak=${weak}` : `Resume-only suggestion (JD silent on this competency); evidence tier strong=${strong} moderate=${moderate} weak=${weak}`) : (jdExpected ? 'JD requires it, resume silent' : 'No evidence in resume — leave for recruiter'),
    detail: { formula: 'evidence-tier + JD alignment', jdRequiredTerms, evidenceCounts: { strong, moderate, weak }, jdExpected },
  };
}

const SKILL_STRONG = /built|developed|implemented|created|led|designed|architected|optimized|automated|deployed|engineered|delivered|migrated|integrated|scaled|debugged|refactored|reduced|improved|increased|saved|trained|analy|automated|monitored|maintained/;
const SKILL_MEASURABLE = /(20\d\d|\b\d+\s*%|users|records|reports?|dashboard|queries|transactions|latency|throughput|requests?\/s|revenue|performed|optimized|reduced)/;
const SKILL_WORK = /intern|worked as|professional experience|current role|current position|responsib|joined|since|for \d+ (years|months)|experience at/;
const SKILL_PROJECT = /project|dashboard|report|case study|academic|portfolio|showcase|thesis/;
const SKILL_CERT = /certified|certification|certificate|completed course|training|course|workshop/;

function skillDepthContext(sentence, skill) {
  let s = ' ' + sentence.toLowerCase() + ' ';
  const names = [skill.display, skill.term].filter(Boolean).map((n) => n.toLowerCase());
  for (const n of names) {
    s = s.split(n).join(' ');
  }
  s = s.split(/\b(?:analysis|analyst|analytical|analytics|analyzed|analyze)\b/).join(' ');
  s = s.replace(/\s+/g, ' ');
  if (SKILL_STRONG.test(s) && SKILL_MEASURABLE.test(s)) return { level: 'strong', score: 95 };
  if (SKILL_STRONG.test(s)) return { level: 'strong', score: 90 };
  if (SKILL_WORK.test(s)) return { level: 'work', score: 80 };
  if (SKILL_PROJECT.test(s)) return { level: 'project', score: 60 };
  if (SKILL_CERT.test(s)) return { level: 'training', score: 40 };
  return { level: 'mention', score: 25 };
}

function skillContainingSentences(resumeLower, sentences, skill) {
  const raw = skill.display.toLowerCase();
  const key = skill.term && skill.term.includes(' ') ? skill.term : raw;
  const hits = [];
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(raw) || (key && key !== raw && sentence.toLowerCase().includes(key))) {
      hits.push(sentence);
      if (hits.length >= 4) break;
    }
  }
  return hits;
}

function maxYears(ents) {
  let max = null;
  for (const e of ents) {
    if (e.category !== 'experience') continue;
    const years = e.years || {};
    const m = years.max === Infinity ? years.min : years.max;
    const r = years.min != null ? years.min : m;
    if (r != null && (max == null || r > max)) max = r;
  }
  return max;
}

const RECENCY_ORDER = { current: 3, recent: 2, stale: 1, unknown: 0 };

function bestRecency(sentences) {
  let best = { label: 'unknown', year: null };
  for (const s of sentences) {
    const r = recencyFor(s);
    if (RECENCY_ORDER[r.label] > RECENCY_ORDER[best.label]) best = r;
    else if (RECENCY_ORDER[r.label] === RECENCY_ORDER[best.label] && (r.year || 0) > (best.year || 0)) best = r;
  }
  return best;
}

const DEGREE_LEVELS = { bachelor: 1, master: 2, phd: 3, diploma: 0.5, '12th': 0 };
function degreeLevel(term) {
  const t = term.toLowerCase();
  if (/(ph\.?d|doctorate)/.test(t)) return { level: 3, major: null };
  if (/\b(m\.?tech|m\.?s\.?c|m\.?com|m\.?ca|m\.?ba|m\.?a\.?c?|master)/.test(t)) return { level: 2, major: t };
  if (/\b(b\.?tech|b\.?s\.?c|b\.?com|b\.?ca|b\.?a\.?c?|bachelor|b\.e)/.test(t)) return { level: 1, major: t };
  if (/\bdiploma|polytechnic/.test(t)) return { level: 0.5, major: t };
  if (/(12th|hsc|higher secondary|intermediate)/.test(t)) return { level: 0, major: t };
  return { level: null, major: t };
}

const ROLE_VOCAB = ['analyst', 'engineer', 'developer', 'consultant', 'intern', 'associate', 'lead', 'manager', 'designer', 'scientist', 'accountant', 'architect', 'specialist', 'executive', 'marketer', 'recruiter', 'tester', 'writer', 'coordinator', 'administrator'];

function evaluateTechnical(jdText, resumeText) {
  const meta = SOP_PARAM_META[111];
  const jdEnts = extractStructured(String(jdText || ''), { jd: true });
  const resumeLower = String(resumeText || '').toLowerCase();
  const sentences = sentenceSplit(resumeText);
  const resAll = extractEntities(resumeText);
  const resProfile = extractCandidateProfile(resumeText);
  const resumeSections = buildResumeSections(resumeText);

  const requiredSkills = jdEnts.filter((e) => (e.category === 'technical' || e.category === 'tools') && e.mode === 'required');
  const preferredSkills = jdEnts.filter((e) => (e.category === 'technical' || e.category === 'tools') && e.mode === 'preferred' && !requiredSkills.some((r) => r.term === e.term || r.display === e.display));

  if (requiredSkills.length === 0 && preferredSkills.length === 0) {
    return {
      parameter_id: 111, name: meta.name, weight: meta.weight, grp: meta.grp,
      score: null, status: 'not_scored', confidence: null, evidence: [], gaps: [],
      reason: 'JD does not specify technical or tool skill requirements — leave for recruiter.',
      detail: { formula: 'Σ(skill_depth × importance) / Σ(importance)', required: 0, preferred: 0 },
    };
  }

  const importanceOf = (e, mode) => {
    if (mode === 'preferred') return 1;
    const ctx = (e.context || '').toLowerCase();
    if (/essential|critical|\bmust\b|mandatory|core|\bkey\b|expert|advanced|proven|proficient/.test(ctx)) return 3;
    return 2;
  };

  const scored = [];
  for (const skill of requiredSkills) {
    const importance = importanceOf(skill, 'required');
    const kbHits = resAll.filter((r) => r.term === skill.term || r.display.toLowerCase() === skill.display.toLowerCase());
    const rawHits = skillContainingSentences(resumeLower, sentences, skill);
    const contexts = uniqueStrings([...kbHits.map((r) => r.context), ...rawHits]);
    let depth = null;
    if (contexts.length === 0) {
      depth = resProfile.has(skill.term) ? { level: 'mention', score: 25 } : { level: 'none', score: 0 };
    } else {
      depth = { level: 'mention', score: 25, snippet: contexts[0], contextCount: contexts.length };
      for (const c of contexts) {
        const d = skillDepthContext(c, skill);
        if (d.score > depth.score) depth = Object.assign({ snippet: c, contextCount: contexts.length }, d);
      }
    }
    const hitSentences = rawHits.length ? rawHits.slice(0, 2) : [];
    const section = hitSentences.length ? labelForSentence(hitSentences[0], resumeSections) : null;
    const recency = hitSentences.length ? bestRecency(hitSentences) : { label: 'unknown', year: null };
    scored.push({ skill, importance, depth, section, recency });
  }

  const weighted = scored.reduce((sum, s) => sum + s.depth.score * s.importance, 0);
  const weightSum = scored.reduce((sum, s) => sum + s.importance, 0);
  let score = Math.round(weighted / Math.max(1, weightSum));

  const preferredBonus = preferredSkills.reduce((bonus, p) => {
    const present = resProfile.has(p.term) || resumeLower.includes(p.display.toLowerCase()) || resumeLower.includes(p.term);
    return present ? bonus + 2 : bonus;
  }, 0);
  score = cap(score + Math.min(10, preferredBonus), 0, 100);

  const matchedN = scored.filter((s) => s.depth.score > 0).length;
  const strongN = scored.filter((s) => s.depth.level === 'strong' || s.depth.level === 'work').length;
  const conf = cap(0.4 + 0.35 * (matchedN / scored.length) + 0.15 * (strongN / Math.max(1, matchedN)), 0.3, 0.95);
  const roundedConf = Math.round(conf * 100) / 100;

  const evidence = [];
  const gaps = [];
  for (const s of scored) {
    if (s.depth.score === 0 || s.depth.level === 'none') {
      gaps.push(`Required skill "${s.skill.display || s.skill.term}" — no evidence in resume.`);
      continue;
    }
    evidence.push({
      source: 'resume',
      strength: s.depth.level === 'strong' ? 'strong' : s.depth.level === 'work' ? 'moderate' : 'weak',
      section: s.section,
      recency: s.recency.label,
      recencyYear: s.recency.year,
      text: '"' + (s.depth.snippet || s.skill.display) + '"' + ` (depth: ${skillLevelLabel(s.depth.level)} ${s.depth.score}${s.section ? ` · section: ${s.section}` : ''}${s.recency.label !== 'unknown' ? ` · ${s.recency.label}${s.recency.year ? ' ' + s.recency.year : ''}` : ''})`,
    });
  }
  for (const p of preferredSkills) {
    const present = resProfile.has(p.term) || resumeLower.includes(p.display.toLowerCase());
    if (present) evidence.push({ source: 'resume', strength: 'moderate', text: `Preferred skill "${p.display}" present in resume (+${preferredBonus} bonus).` });
  }

  return {
    parameter_id: 111, name: meta.name, weight: meta.weight, grp: meta.grp,
    score, status: 'active', confidence: roundedConf, evidence, gaps,
    reason: `Technical score = Σ(skill_depth × importance)/Σ(importance); matched ${matchedN}/${scored.length} required skills (${preferredBonus} preferred bonus).`,
    detail: { formula: 'Σ(skill_depth × importance) / Σ(importance)', required: requiredSkills.length, matched: matchedN, missing: scored.length - matchedN, preferredBonus, skills: scored.map((s) => ({ skill: s.skill.display, importance: s.importance, depth: s.depth.score, level: s.depth.level, section: s.section, recency: s.recency.label, recencyYear: s.recency.year })) },
  };
}

function skillLevelLabel(level) {
  const map = { strong: 'strong measurable use', work: 'work/internship experience', project: 'project/academic use', training: 'course/certification', mention: 'mention only' };
  return map[level] || 'none';
}

function evaluateExperience(jdText, resumeText, jobTitle) {
  const meta = SOP_PARAM_META[112];
  const jdEnts = extractStructured(String(jdText || ''), { jd: true });
  const resEnts = extractStructured(String(resumeText || ''));
  const resumeLower = String(resumeText || '').toLowerCase();

  const jdResp = jdEnts.filter((e) => e.category === 'responsibilities' && e.mode === 'required').map((e) => e.term);
  const jdDom = jdEnts.filter((e) => e.category === 'domain' && e.mode === 'required').map((e) => e.term);
  const resResp = new Set(resEnts.filter((e) => e.category === 'responsibilities').map((e) => e.term));
  const resDom = new Set(resEnts.filter((e) => e.category === 'domain').map((e) => e.term));
  const jdYears = maxYears(jdEnts);
  const resYears = maxYears(resEnts);

  const hasExperienceEvidence = resResp.size > 0 || resDom.size > 0 || resYears != null;
  const jdHasAnyReq = jdResp.length > 0 || jdDom.length > 0 || jdYears != null;

  const titleLower = String(jobTitle || '').toLowerCase();
  const titleTokens = uniqueStrings(titleLower.split(/[\s|,/+&()]+/).filter((w) => w.length >= 3));
  const roleTokens = titleTokens.filter((w) => ROLE_VOCAB.includes(w));
  const resumeRoleHits = ROLE_VOCAB.filter((w) => resumeLower.includes(w));
  const roleSimilarity = roleTokens.length > 0
    ? roleTokens.filter((w) => resumeRoleHits.includes(w)).length / roleTokens.length
    : 0;

  const respSim = jdResp.length > 0 ? [...jdResp].filter((t) => resResp.has(t)).length / jdResp.length : 0;
  const domSim = jdDom.length > 0 ? [...jdDom].filter((t) => resDom.has(t)).length / jdDom.length : 0;

  let seniority = 0.8;
  if (jdYears != null) {
    if (resYears == null) seniority = 0.4;
    else seniority = cap(resYears / jdYears, 0, 1);
  }

  const cur = new Date().getFullYear();
  const resumeYearsFound = (resumeLower.match(/\b(20\d\d)\b/g) || []).map((m) => parseInt(m, 10));
  const recency = /present|current/.test(resumeLower) || Math.max(0, ...resumeYearsFound, 0) >= cur - 1 ? 1 : 0.6;

  if (!jdHasAnyReq && roleTokens.length === 0) {
    return {
      parameter_id: 112, name: meta.name, weight: meta.weight, grp: meta.grp,
      score: null, status: 'not_scored', confidence: null, evidence: [], gaps: [],
      reason: 'JD contains no experience, role, responsibility or industry requirement to compare against.',
      detail: { formula: '35% role similarity + 25% responsibility + 20% industry + 10% seniority + 10% recency' },
    };
  }
  if (!hasExperienceEvidence) {
    return {
      parameter_id: 112, name: meta.name, weight: meta.weight, grp: meta.grp,
      score: null, status: 'not_scored', confidence: null, evidence: [], gaps: [],
      reason: 'No work-experience evidence in resume (no responsibilities, industry or tenure found) — leave for recruiter.',
      detail: { formula: '35% role similarity + 25% responsibility + 20% industry + 10% seniority + 10% recency' },
    };
  }

  const score = cap(Math.round(100 * (0.35 * roleSimilarity + 0.25 * respSim + 0.2 * domSim + 0.1 * seniority + 0.1 * recency)), 0, 100);
  const conf = cap(0.35 + 0.25 * respSim + 0.2 * roleSimilarity + 0.2 * domSim, 0, 0.9);
  const roundedConf = Math.round(conf * 100) / 100;

  const evidence = [];
  const gaps = [];
  if (roleTokens.length > 0) {
    evidence.push({ source: 'resume', strength: roleSimilarity >= 0.5 ? 'strong' : 'moderate', text: `Role "${jobTitle}" — resume shows ${roleTokens.filter((w) => resumeRoleHits.includes(w)).join(', ') || 'no direct role words'}` });
  }
  const matchedResp = jdResp.filter((t) => resResp.has(t));
  for (const t of matchedResp.slice(0, 4)) evidence.push({ source: 'resume', strength: 'moderate', text: `Responsibility "${t}" reflected in resume.` });
  for (const t of jdResp.filter((x) => !resResp.has(x)).slice(0, 4)) gaps.push(`JD responsibility "${t}" not reflected in resume.`);
  if (jdDom.length > 0) {
    const matchedDom = jdDom.filter((t) => resDom.has(t));
    evidence.push({ source: 'resume', strength: domSim >= 0.5 ? 'strong' : 'moderate', text: matchedDom.length > 0 ? `Industry/domain match: ${matchedDom.join(', ')}` : 'No industry/domain overlap detected.' });
    if (matchedDom.length === 0) gaps.push('JD industry/domain terms not present in resume.');
  }
  if (jdYears != null) {
    evidence.push({ source: 'resume', strength: 'moderate', text: resYears != null ? `Experience ${resYears}+ years vs JD requiring ${jdYears}+ years.` : 'JD requires experience years but resume has no tenure.' });
  }
  evidence.push({ source: 'resume', strength: recency === 1 ? 'strong' : 'weak', text: recency === 1 ? 'Recent/current professional history present.' : 'Recency weak — no recent (past 2 years) dates or current role found.' });

  return {
    parameter_id: 112, name: meta.name, weight: meta.weight, grp: meta.grp,
    score, status: 'active', confidence: roundedConf, evidence, gaps,
    reason: `Experience = 35% role(${Math.round(roleSimilarity * 100)}) + 25% responsibility(${Math.round(respSim * 100)}) + 20% industry(${Math.round(domSim * 100)}) + 10% seniority(${Math.round(seniority * 100)}) + 10% recency(${Math.round(recency * 100)}).`,
    detail: { formula: '0.35×role + 0.25×responsibility + 0.20×industry + 0.10×seniority + 0.10×recency', roleSimilarity, respSim, domSim, seniority, recency, jdYears, resYears },
  };
}

function evaluateQualifications(jdText, resumeText) {
  const meta = SOP_PARAM_META[113];
  const jdEnts = extractStructured(String(jdText || ''), { jd: true });
  const resEnts = extractStructured(String(resumeText || ''));
  const jdEduReq = jdEnts.filter((e) => e.category === 'education' && e.mode === 'required');
  const jdEduPref = jdEnts.filter((e) => e.category === 'education' && e.mode === 'preferred');
  const jdCertReq = jdEnts.filter((e) => e.category === 'certificates' && e.mode === 'required');
  const jdCertPref = jdEnts.filter((e) => e.category === 'certificates' && e.mode === 'preferred');

  const resEduTerms = resEnts.filter((e) => e.category === 'education').map((e) => e.term.toLowerCase());
  const resEduDisplays = resEnts.filter((e) => e.category === 'education').map((e) => e.display.toLowerCase());
  const resCertTerms = resEnts.filter((e) => e.category === 'certificates').map((e) => e.term.toLowerCase());
  const resCertDisplays = resEnts.filter((e) => e.category === 'certificates').map((e) => e.display.toLowerCase());

  if (jdEduReq.length === 0 && jdEduPref.length === 0 && jdCertReq.length === 0 && jdCertPref.length === 0) {
    return {
      parameter_id: 113, name: meta.name, weight: meta.weight, grp: meta.grp,
      score: null, status: 'not_scored', confidence: null, evidence: [], gaps: [],
      reason: 'JD does not require specific qualifications or certifications — recruiter may mark N/A.',
      detail: { formula: 'baseline + required edu/cert adjustments' },
    };
  }

  const hasResumeEducation = resEduTerms.length > 0;

  const eduSatisfies = (jdEnt, required) => {
    const jd = degreeLevel(jdEnt.term);
    const target = jd.level;
    let levelOk = false;
    if (target != null) {
      levelOk = resEduTerms.some((t) => (degreeLevel(t).level != null ? degreeLevel(t).level >= target : false));
      if (!levelOk && required && resEduTerms.length > 0) levelOk = resEduTerms.some((t) => degreeLevel(t).level != null);
    }
    const majorWords = (jd.major || '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !/(degree|science|arts|technology|engineering|bachelor|master|management|administration|computer|business)/.test(w));
    const majorOk = majorWords.length === 0 || majorWords.some((w) => resEduDisplays.some((d) => d.includes(w)) || resEduTerms.some((t) => t.includes(w)));
    return levelOk && majorOk;
  };

  const reqEduOk = jdEduReq.filter((e) => eduSatisfies(e, true));
  const reqEduPartial = hasResumeEducation && jdEduReq.filter((e) => !eduSatisfies(e, true)).length > 0;
  const reqEduMissing = !hasResumeEducation && jdEduReq.length > 0;
  const reqCertOk = jdCertReq.filter((e) => resCertTerms.includes(e.term.toLowerCase()) || resCertDisplays.includes(e.display.toLowerCase()));
  const prefEduOk = jdEduPref.filter((e) => eduSatisfies(e, false));
  const prefCertOk = jdCertPref.filter((e) => resCertTerms.includes(e.term.toLowerCase()) || resCertDisplays.includes(e.display.toLowerCase()));

  let score = hasResumeEducation ? 55 : 40;
  if (reqEduOk.length > 0) score += 25;
  else if (reqEduPartial) score += 12;
  else if (reqEduMissing) score -= 15;
  if (reqCertOk.length > 0) score += Math.min(30, 15 * reqCertOk.length);
  const missingReqCert = jdCertReq.length - reqCertOk.length;
  if (missingReqCert > 0) score -= Math.min(25, 25 * missingReqCert);
  score += Math.min(8, 4 * (prefEduOk.length + prefCertOk.length));
  score = cap(score, 10, 90);

  const requiredTotal = jdEduReq.length + jdCertReq.length;
  const requiredOk = reqEduOk.length + reqCertOk.length;
  const conf = cap(0.5 + 0.25 * (requiredTotal > 0 ? requiredOk / requiredTotal : 0.5) + (hasResumeEducation ? 0.15 : 0), 0.3, 0.9);
  const roundedConf = Math.round(conf * 100) / 100;

  const evidence = [];
  const gaps = [];
  for (const e of reqEduOk) evidence.push({ source: 'resume', strength: 'strong', text: `Required education "${e.display}" satisfied.` });
  for (const e of reqCertOk) evidence.push({ source: 'resume', strength: 'strong', text: `Required certification "${e.display}" present.` });
  for (const e of jdEduReq.filter((x) => !reqEduOk.includes(x)).slice(0, 3)) gaps.push(`Required education "${e.display}" not clearly satisfied by resume.`);
  for (const e of jdCertReq.filter((x) => !reqCertOk.includes(x)).slice(0, 3)) gaps.push(`Required certification "${e.display}" missing in resume.`);
  if (requiredTotal > 0 && requiredOk === 0 && hasResumeEducation) gaps.push('Resume shows education but no required credential matched — quality substantially reduced.');
  if (hasResumeEducation) evidence.push({ source: 'resume', strength: 'moderate', text: `Resume shows education: ${resEduDisplays.slice(0, 3).join(', ')}.` });
  for (const e of prefEduOk.concat(prefCertOk).slice(0, 3)) evidence.push({ source: 'resume', strength: 'moderate', text: `Preferred credential "${e.display}" present.` });

  return {
    parameter_id: 113, name: meta.name, weight: meta.weight, grp: meta.grp,
    score, status: 'active', confidence: roundedConf, evidence, gaps,
    reason: `Qualifications = baseline(${hasResumeEducation ? 55 : 40}) + requiredEdu(+25 when met, +12 partial, -15 missing: ${reqEduOk.length}/${reqEduPartial}/${reqEduMissing}) + requiredCert(+15 each, ${reqCertOk.length}) - missingCert(-25 each, ${missingReqCert}) + preferred(${prefEduOk.length + prefCertOk.length}).`,
    detail: { formula: 'baseline + required edu/cert adjustments', requiredEducation: jdEduReq.map((e) => e.display), requiredCerts: jdCertReq.map((e) => e.display), satisfiedEdu: reqEduOk.map((e) => e.display), satisfiedCerts: reqCertOk.map((e) => e.display), requiredOk, requiredTotal },
  };
}

function autoRateSopParameters({ jdText, resumeText, jobTitle }) {
  const jdLower = String(jdText || '').toLowerCase();
  const sentences = sentenceSplit(resumeText);
  const results = [];
  Object.entries(PERSON_RULES).forEach(([rawId, rule]) => {
    const id = Number(rawId);
    results.push(evaluatePerson(rule, id, jdLower, sentences));
  });
  results.push(evaluateTechnical(jdText, resumeText));
  results.push(evaluateExperience(jdText, resumeText, jobTitle));
  results.push(evaluateQualifications(jdText, resumeText));
  return results;
}

module.exports = { autoRateSopParameters, PERSON_RULES, SOP_PARAM_META };