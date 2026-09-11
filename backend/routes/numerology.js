const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const numer = require('../numerologyUtils');
const { suggestAllRatings } = require('../suggestionEngine');
const parameterThemeMap = require('../parameterThemeMap');
const { computeTriNature, buildCoreNumbers } = require('../triNatureEngine');
const { buildOverallConclusion } = require('../overallConclusion');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// Feature flag: ENABLE_INNER_INTELLIGENCE=true turns the module on.
const ENABLED = (process.env.ENABLE_INNER_INTELLIGENCE || '').toLowerCase() === 'true';

function gate(req, res) {
  if (!ENABLED) {
    return res.status(404).json({ error: 'Inner Intelligence is not enabled for this organisation' });
  }
  return null;
}

// ---------- helpers ----------

function getEmployeeOr404(id) {
  return db.prepare('SELECT id, name, email FROM users WHERE id = ? AND role = ?').get(id, 'employee');
}

const ELEMENT_NAMES = { AGNI: 'Momentum', VAYU: 'Ideation', JALA: 'Connection', AKASHA: 'Perspective' };
const MODE_NAMES = { Sattva: 'Composure', Rajas: 'Energy & Drive', Tamas: 'Change Resistance' };

function archetypeFor(number) {
  const a = db.prepare('SELECT * FROM numerology_archetypes WHERE number = ?').get(number);
  if (!a) return null;
  try { a.tags = JSON.parse(a.tags); } catch (e) { a.tags = []; }
  return a;
}

function getProfile(employeeId) {
  let profile = db.prepare(
    'SELECT * FROM numerology_profiles WHERE employee_id = ? AND dimension = ?'
  ).get(employeeId, 'candidate');
  const u = db.prepare('SELECT date_of_birth, name FROM users WHERE id = ?').get(employeeId);
  if (u && u.date_of_birth) {
    const stale = !profile || profile.date_of_birth !== u.date_of_birth;
    if (stale) {
      try {
        const name = profile ? (profile.numerology_name || profile.full_name || u.name) : u.name;
        profile = computeAndStoreProfile(employeeId, u.date_of_birth, name);
      } catch (e) {}
    }
  }
  return profile;
}

function computeAndStoreProfile(employeeId, isoDob, numerologyName) {
  const emp = db.prepare('SELECT name FROM users WHERE id = ?').get(employeeId);
  const fullName = numerologyName || (emp ? emp.name : '');
  const lifePath = numer.lifePathNumber(isoDob);
  const birth = numer.birthNumber(isoDob);
  const expression = numer.nameNumber(fullName, { keepMaster: true });
  const archetype = archetypeFor(lifePath);
  const archetypeNumber = archetype ? archetype.number : (lifePath === 33 ? 33 : lifePath);
  db.prepare(`
    INSERT INTO numerology_profiles
      (employee_id, dimension, date_of_birth, life_path_number, birth_number, expression_number, full_name, numerology_name, archetype_number, narrative_snapshot, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(employee_id, dimension) DO UPDATE SET
      date_of_birth = excluded.date_of_birth,
      life_path_number = excluded.life_path_number,
      birth_number = excluded.birth_number,
      expression_number = excluded.expression_number,
      full_name = excluded.full_name,
      numerology_name = excluded.numerology_name,
      archetype_number = excluded.archetype_number,
      updated_at = datetime('now')
  `).run(employeeId, 'candidate', isoDob, lifePath, birth, expression, fullName, fullName, archetypeNumber);
  return getProfile(employeeId);
}

function getWeights() {
  return numer.WEIGHTS;
}

// Match-vs-role: score-based fit adjusted by numerology resonance
function matchVsRole(employeeId, profile) {
  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(employeeId);
  if (!sc) return [];
  const rows = db.prepare(`
    SELECT p.name, s.score, p.weightage
    FROM scores s JOIN parameters p ON p.id = s.parameter_id
    WHERE s.scorecard_id = ?
  `).all(sc.id);
  const lifePath = profile ? profile.life_path_number : null;
  const personalYear = profile && profile.date_of_birth ? numer.personalYearNumber(profile.date_of_birth, new Date().getFullYear()) : null;
  return rows.map(r => {
    const fit = numer.paramNumerologyFit(r.score, r.name, lifePath, personalYear);
    const kw = numer.KEYWORDS[fit.paramNum];
    return {
      parameter: r.name,
      score: r.score,
      weightage: r.weightage,
      role_fit: fit.adjusted,
      base_fit: fit.base,
      bonus: fit.bonus,
      param_number: fit.paramNum,
      param_theme: kw ? kw.name : '',
      resonance: fit.resonance,
      diffLife: fit.diffLife,
    };
  });
}

// 4-year personal-year timeline starting at current year.
function personalYearTimeline(isoDob, startYear) {
  const years = [];
  for (let y = startYear; y < startYear + 4; y++) {
    const n = numer.personalYearNumber(isoDob, y);
    const t = numer.PERSONAL_YEAR_THEMES[n];
    years.push({ year: y, number: n, theme: t ? t.theme : '—', description: t ? t.description : '' });
  }
  return years;
}

function generateNarrative(profile) {
  const arch = archetypeFor(profile.archetype_number);
  const now = new Date().getFullYear();
  const py = numer.personalYearNumber(profile.date_of_birth, now);
  const theme = numer.PERSONAL_YEAR_THEMES[py];
  const archName = arch ? arch.name : 'Unknown';
  const archSummary = arch ? arch.summary : '';
  const tagList = arch && arch.tags && arch.tags.length ? arch.tags.join(', ').toLowerCase() : '';
  let triLine = '';
  try {
    const { computeTriNature } = require('../triNatureEngine');
    const name = profile.numerology_name || profile.full_name || '';
    const tri = computeTriNature(name, profile.date_of_birth);
    if (tri && tri.hasProfile) {
      const topBehav = Object.entries(tri.parameters).sort((a,b)=>b[1].score-a[1].score).slice(0,2).map(([k,v])=> `${k} (${v.score})`).join(', ');
      triLine = `Behaviorally, ${tri.signature.name} — dominant ${ELEMENT_NAMES[tri.dominantElement] || tri.dominantElement} (${tri.elements[tri.dominantElement]}) in a ${MODE_NAMES[tri.dominantMode] || tri.dominantMode} mode — with strongest behavioral signals in ${topBehav}.`;
    }
  } catch(e) {}
  const parts = [
    `${profile.life_path_number} ${archName}: ${archSummary}`,
    tagList ? `In practice this tends to show up as ${tagList}.` : '',
    `Their birth number (${profile.birth_number}${profile.birth_number === 11 || profile.birth_number === 22 ? ` / ${[...String(profile.birth_number)].reduce((a, d) => a + Number(d), 0)}` : ''}) reinforces a recognisable default way of working.`,
    `The current personal year (${py}, ${theme ? theme.theme : 'n/a'}) points at a season of ${theme ? theme.description.toLowerCase() : 'transition'}.`,
    triLine,
    'This is a descriptive lens, not a verified psychological profile — treat it as one input to verify in conversation, never as a hiring signal.',
  ];
  return parts.filter(Boolean).join(' ');
}

function generateInterviewPrep(employeeId) {
  const profile = getProfile(employeeId);
  let behavFocus = null;
  try {
    const { computeTriNature } = require('../triNatureEngine');
    const emp = getEmployeeOr404(employeeId);
    const name = profile ? (profile.numerology_name || profile.full_name || emp.name) : emp.name;
    const dob = profile ? profile.date_of_birth : null;
    if (dob) {
      const tri = computeTriNature(name, dob);
      if (tri && tri.hasProfile) {
        const sorted = Object.entries(tri.parameters).sort((a,b)=> a[1].score - b[1].score);
        const lowest = sorted[0];
        if (lowest) behavFocus = { parameter: lowest[0], score: lowest[1].score, shadow: lowest[1].shadow, light: lowest[1].light, element: lowest[1].element };
      }
    }
  } catch(e) {}
  if (behavFocus) {
    const prompts = [
      `Walk me through a recent moment where "${behavFocus.parameter}" showed up — ${behavFocus.shadow.toLowerCase()}. What happened and how did you handle it?`,
      `When ${behavFocus.parameter.toLowerCase()} feels stretched, what helps you return to ${behavFocus.light.toLowerCase()}?`,
      `Tell me about a time you noticed ${behavFocus.parameter.toLowerCase()} in a team — what did you do next?`,
    ];
    return { focus: behavFocus.parameter, focusDetail: behavFocus, prompts, note: 'Reflection, not a prediction. Based on behavioral (Tri-Nature) signals — conversation starters, not hiring signals.' };
  }
  const delta = matchVsRole(employeeId, profile).slice().sort((a, b) => a.role_fit - b.role_fit);
  const focus = delta.length ? delta[0] : null;
  const prompts = [
    focus
      ? `Walk me through a recent task where you had to apply "${focus.parameter}". What did you do and what was the result?`
      : 'Walk me through a recent task you are proud of. What did you do and what was the result?',
    'Tell me about a time expectations changed partway through — how did you adapt?',
    'Describe how you handle a deadline that is moving up unexpectedly.',
  ];
  const note = 'Reflection, not a prediction. These are conversation starters — saying nothing about whether to hire.';
  return { focus: focus ? focus.parameter : null, prompts, note };
}

// ---------- routes ----------

// Multi-candidate comparison. Declared BEFORE /:id routes so "numerology" isn't captured as :id.
router.get('/employees/numerology/compare', (req, res) => {
  if (gate(req, res)) return;
  const ids = String(req.query.ids || '').split(',').map(s => Number(s.trim())).filter(n => n > 0);
  const out = ids.map(id => {
    const emp = getEmployeeOr404(id);
    if (!emp) return null;
    const profile = getProfile(id);
    const arch = profile ? archetypeFor(profile.archetype_number) : null;
    const now = new Date().getFullYear();
    const py = profile ? numer.personalYearNumber(profile.date_of_birth, now) : null;
    return {
      id,
      name: emp.name,
      archetype: arch ? { number: arch.number, name: arch.name } : null,
      life_path_number: profile ? profile.life_path_number : null,
      birth_number: profile ? profile.birth_number : null,
      current_personal_year: py,
      theme: py ? (numer.PERSONAL_YEAR_THEMES[py] ? numer.PERSONAL_YEAR_THEMES[py].theme : null) : null,
    };
  }).filter(Boolean);
  res.json(out);
});

// Archetype card + match-vs-role bars
router.get('/employees/:id/numerology', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  let profile = getProfile(req.params.id);
  if (!profile) {
    return res.json({ hasProfile: false, message: 'No numerology profile yet. Enter a date of birth.', matchVsRole: matchVsRole(emp.id, null) });
  }
  if (profile.expression_number == null) {
    const expr = numer.nameNumber(emp.name, { keepMaster: true });
    try { db.prepare('UPDATE numerology_profiles SET expression_number = ?, full_name = ? WHERE id = ?').run(expr, emp.name, profile.id); profile = getProfile(req.params.id); } catch (e) {}
  }
  const arch = archetypeFor(profile.archetype_number);
  const now = new Date().getFullYear();
  const py = numer.personalYearNumber(profile.date_of_birth, now);
  const weights = getWeights();
  const composite = profile.expression_number != null ? numer.compositePersonalNumber(profile.life_path_number, profile.birth_number, profile.expression_number) : null;
  res.json({
    hasProfile: true,
    date_of_birth: profile.date_of_birth,
    life_path_number: profile.life_path_number,
    birth_number: profile.birth_number,
    expression_number: profile.expression_number,
    full_name: profile.full_name,
    numerology_name: profile.numerology_name || profile.full_name,
    composite_number: composite,
    weights,
    archetype: arch,
    current_personal_year: py,
    current_personal_year_theme: numer.PERSONAL_YEAR_THEMES[py] ? numer.PERSONAL_YEAR_THEMES[py].theme : null,
    updated_at: profile.updated_at,
  });
});

// Admin sets/edits DOB -> recompute profile server-side
router.post('/employees/:id/numerology', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const dob = String(req.body.date_of_birth || '').trim();
  const numerology_name = req.body.numerology_name ? String(req.body.numerology_name).trim() : (req.body.full_name ? String(req.body.full_name).trim() : null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return res.status(400).json({ error: 'date_of_birth must be YYYY-MM-DD' });
  }
  try {
    db.prepare('UPDATE users SET date_of_birth = ? WHERE id = ?').run(dob, emp.id);
    const profile = computeAndStoreProfile(emp.id, dob, numerology_name);
    res.json(profile);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 4-year personal-year cycle timeline
router.get('/employees/:id/numerology/cycle', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const profile = getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'No numerology profile. Set DOB first.' });
  const startYear = new Date().getFullYear();
  res.json({ timeline: personalYearTimeline(profile.date_of_birth, startYear), start_year: startYear });
});

// Narrative snapshot (cached; template-based)
router.get('/employees/:id/numerology/narrative', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  let profile = getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'No numerology profile. Set DOB first.' });
  if (!profile.narrative_snapshot) {
    const narrative = generateNarrative(profile);
    db.prepare('UPDATE numerology_profiles SET narrative_snapshot = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(narrative, profile.id);
    profile = getProfile(req.params.id);
  }
  res.json({ narrative_snapshot: profile.narrative_snapshot });
});

// Interview prep prompts
router.get('/employees/:id/numerology/interview-prep', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(generateInterviewPrep(emp.id));
});

router.get('/employees/:id/numerology/numo-params', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const profile = getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'No numerology profile. Set DOB first.' });
  let company = null;
  if (req.query.companyId) company = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(req.query.companyId);
  else {
    const user = db.prepare('SELECT job_description_id FROM users WHERE id = ?').get(req.params.id);
    if (user && user.job_description_id) {
      const jd = db.prepare('SELECT company_id FROM job_descriptions WHERE id = ?').get(user.job_description_id);
      if (jd && jd.company_id) company = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(jd.company_id);
    }
    if (!company) company = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  }
  const params = numer.computeNumoParameters(profile, company);
  res.json({ params, company_id: company ? company.id : null });
});

router.get('/employees/:id/numerology/match-vs-role', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const profile = getProfile(req.params.id);
  const weights = profile ? getWeights() : numer.WEIGHTS;
  const composite = profile ? numer.compositePersonalNumber(profile.life_path_number, profile.birth_number, profile.expression_number) : null;
  const scores = db.prepare(`
    SELECT s.score, p.id as parameter_id, p.name as parameter_name
    FROM scores s JOIN parameters p ON p.id = s.parameter_id
    JOIN scorecards sc ON sc.id = s.scorecard_id
    WHERE sc.employee_id = ?
  `).all(emp.id);
  const scoreMap = Object.fromEntries(scores.map(s => [s.parameter_id, s.score]));
  const { matchVsRole } = require('../matchVsRole');
  const parameterThemeMap = require('../parameterThemeMap');
  const result = Object.entries(parameterThemeMap).map(([paramId, theme]) => {
    const baseScore = scoreMap[paramId] || null;
    const diff = composite != null ? Math.abs(composite - theme) : null;
    const resonanceAdjust = composite != null && diff != null ? ({ 0: 12, 1: 6, 2: 0, 3: -1 }[diff] ?? -3) : 0;
    const basePct = baseScore ? Math.round((baseScore / 5) * 100) : 60;
    const fitPct = Math.max(0, Math.min(100, basePct + resonanceAdjust));
    const paramName = db.prepare('SELECT name FROM parameters WHERE id = ?').get(paramId);
    const { explainParameter } = require('../resonanceCopy');
    const explained = composite != null && diff != null ? explainParameter(paramName ? paramName.name : `Param ${paramId}`, diff) : { label: 'Neutral', icon: '·', tone: 'neutral', oneLiner: `Base score only — add DOB and name to see numerology-adjusted fit for ${paramName ? paramName.name.toLowerCase() : 'this parameter'}.` };
    return {
      parameter_id: Number(paramId),
      parameter_name: paramName ? paramName.name : `Param ${paramId}`,
      param_theme: paramName ? '' : '',
      theme,
      composite,
      diff,
      baseScore,
      basePct,
      fitPct,
      adjust: resonanceAdjust,
      ...explained,
    };
  });
  res.json({ composite, weights, suggestions: result });
});

// Suggested ratings (read-only, never writes to scores)
router.get('/employees/:id/suggested-ratings', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  let profile = getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'No numerology profile. Set DOB and name first.' });
  if (profile.expression_number == null) {
    const expr = numer.nameNumber(emp.name, { keepMaster: true });
    const fullName = emp.name;
    try { db.prepare('UPDATE numerology_profiles SET expression_number = ?, full_name = ? WHERE id = ?').run(expr, fullName, profile.id); } catch (e) {}
    profile = getProfile(req.params.id);
  }
  const weights = getWeights();
  const composite = numer.compositePersonalNumber(profile.life_path_number, profile.expression_number, profile.birth_number, weights);
  const suggestions = suggestAllRatings(composite);
  const detailed = Object.entries(suggestions).map(([paramId, rating]) => {
    const theme = parameterThemeMap[paramId];
    const diff = Math.abs(composite - theme);
    const paramName = db.prepare('SELECT name FROM parameters WHERE id = ?').get(paramId);
    return {
      parameter_id: Number(paramId),
      parameter_name: paramName ? paramName.name : `Param ${paramId}`,
      theme,
      composite,
      diff,
      suggested_rating: rating,
      reason: `Composite ${composite} vs theme ${theme} (Δ${diff}) → ${rating}/5`,
    };
  });
  res.json({ composite, weights, life_path: profile.life_path_number, expression: profile.expression_number, birth: profile.birth_number, suggestions: detailed });
});

// Company (org) numerology profile (legacy single)
router.get('/company-numerology', (req, res) => {
  if (gate(req, res)) return;
  const row = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  if (!row) return res.json({ hasProfile: false });
  res.json(row);
});

// Multi-company CRUD
router.get('/companies', (req, res) => {
  if (gate(req, res)) return;
  const rows = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id').all();
  res.json(rows);
});

router.post('/companies', (req, res) => {
  if (gate(req, res)) return;
  const client_name = String(req.body.client_name || '').trim();
  const founder_name = String(req.body.founder_name || '').trim();
  const founded_year = Number(req.body.founded_year);
  const brand_name = String(req.body.brand_name || req.body.client_name || '').trim();
  if (!client_name || !founder_name || !founded_year) return res.status(400).json({ error: 'client_name, founder_name, founded_year are required' });
  const founded_number = numer.foundedNumber(founded_year);
  const brand_number = numer.nameNumber(brand_name, { keepMaster: false });
  const founder_number = numer.nameNumber(founder_name, { keepMaster: false });
  const info = db.prepare('INSERT INTO company_numerology_profiles (client_name, founded_year, brand_name, founder_name, founded_number, brand_number, founder_number) VALUES (?, ?, ?, ?, ?, ?, ?)').run(client_name, founded_year, brand_name, founder_name, founded_number, brand_number, founder_number);
  const row = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/companies/:id', (req, res) => {
  if (gate(req, res)) return;
  const existing = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company not found' });
  const client_name = req.body.client_name != null ? String(req.body.client_name).trim() : existing.client_name;
  const founder_name = req.body.founder_name != null ? String(req.body.founder_name).trim() : existing.founder_name;
  const founded_year = req.body.founded_year != null ? Number(req.body.founded_year) : existing.founded_year;
  const brand_name = req.body.brand_name != null ? String(req.body.brand_name).trim() : existing.brand_name;
  const founded_number = numer.foundedNumber(founded_year);
  const brand_number = numer.nameNumber(brand_name, { keepMaster: false });
  const founder_number = numer.nameNumber(founder_name, { keepMaster: false });
  db.prepare('UPDATE company_numerology_profiles SET client_name=?, founded_year=?, brand_name=?, founder_name=?, founded_number=?, brand_number=?, founder_number=? WHERE id=?').run(client_name, founded_year, brand_name, founder_name, founded_number, brand_number, founder_number, req.params.id);
  const row = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.delete('/companies/:id', (req, res) => {
  if (gate(req, res)) return;
  const existing = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company not found' });
  const linked = db.prepare('SELECT id FROM job_descriptions WHERE company_id = ? LIMIT 1').get(req.params.id);
  if (linked) return res.status(400).json({ error: 'Cannot delete — a JD references this company. Reassign or delete the JD first.' });
  db.prepare('DELETE FROM company_numerology_profiles WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// Company (org) numerology profile - create/update with computed numbers at write time
router.post('/company-numerology', (req, res) => {
  if (gate(req, res)) return;
  const client_name = String(req.body.client_name || '').trim();
  const founded_year = Number(req.body.founded_year);
  const brand_name = String(req.body.brand_name || '').trim();
  const founder_name = String(req.body.founder_name || '').trim();
  if (!client_name || !founded_year || !brand_name || !founder_name) {
    return res.status(400).json({ error: 'client_name, founded_year, brand_name, founder_name are required' });
  }
  const founded_number = numer.foundedNumber(founded_year);
  const brand_number = numer.nameNumber(brand_name);
  const founder_number = numer.nameNumber(founder_name);
  const existing = db.prepare('SELECT id FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  if (existing) {
    db.prepare(`UPDATE company_numerology_profiles SET client_name=?, founded_year=?, brand_name=?, founder_name=?, founded_number=?, brand_number=?, founder_number=? WHERE id=?`)
      .run(client_name, founded_year, brand_name, founder_name, founded_number, brand_number, founder_number, existing.id);
  } else {
    db.prepare(`INSERT INTO company_numerology_profiles (client_name, founded_year, brand_name, founder_name, founded_number, brand_number, founder_number) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(client_name, founded_year, brand_name, founder_name, founded_number, brand_number, founder_number);
  }
  const row = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  res.json(row);
});

router.get('/employees/:id/tri-nature', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const profile = getProfile(req.params.id);
  const name = profile ? (profile.numerology_name || profile.full_name || emp.name) : emp.name;
  const dob = profile ? profile.date_of_birth : null;
  const user = db.prepare('SELECT resume_text FROM users WHERE id=?').get(emp.id);
  const resumeText = user ? user.resume_text : null;
  const result = computeTriNature(name, dob, resumeText);
  if (!result.hasProfile) {
    return res.json({ hasProfile:false, message:'No numerology profile — set DOB and name first.', core: result.core });
  }
  res.json(result);
});

router.get('/employees/:id/tri-nature/core-numbers', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const profile = getProfile(req.params.id);
  if (!profile) return res.json({ hasProfile:false });
  const name = profile.numerology_name || profile.full_name || emp.name;
  const core = buildCoreNumbers(name, profile.date_of_birth);
  res.json({ hasProfile:true, core, name, dob: profile.date_of_birth });
});

router.post('/employees/:id/report', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const { date_of_birth, numerology_name, selectedFeatures } = req.body || {};
  let dob = date_of_birth || null;
  let name = numerology_name || emp.name;
  let profile = getProfile(req.params.id);
  if (dob) {
    try { profile = computeAndStoreProfile(emp.id, String(dob).trim(), String(name).trim()); } catch(e){ return res.status(400).json({ error:e.message }); }
  } else if (profile) {
    dob = profile.date_of_birth;
    name = profile.numerology_name || profile.full_name || name;
  }
  const user = db.prepare('SELECT resume_text, job_description_id FROM users WHERE id=?').get(emp.id);
  const resumeText = user ? user.resume_text : null;
  const triNature = computeTriNature(name, dob, resumeText);
  const interview = (()=>{ try{ return generateInterviewPrep(emp.id); }catch(e){ return null; }})();
  let flags=[];
  try{
if (resumeText) {
      const jdRow = user && user.job_description_id ? db.prepare('SELECT description_text FROM job_descriptions WHERE id=?').get(user.job_description_id) : null;
      const { detectResumeFlags } = require('../resumeFlags');
      const { matchResumeToJD } = require('../capabilityMatch');
      const jdKeywords = user && user.job_description_id
        ? db.prepare('SELECT keyword, mode FROM jd_keywords WHERE jd_id = ? AND is_active = 1 ORDER BY id').all(user.job_description_id)
        : [];
      const cap = jdRow ? matchResumeToJD(jdRow.description_text, resumeText, { jdKeywords }) : { pct: 0 };
      flags = detectResumeFlags(resumeText, jdRow ? jdRow.description_text : '', cap);
    }
  }catch(e){}
  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
  let scores=[]; let weightedPct=null;
  if(sc){
    scores=db.prepare('SELECT s.score, p.name, p.id as parameter_id FROM scores s JOIN parameters p ON p.id=s.parameter_id WHERE s.scorecard_id=?').all(sc.id);
    const params=db.prepare('SELECT id, weightage FROM parameters').all();
    const wMap=Object.fromEntries(params.map(p=>[p.id,p.weightage]));
    weightedPct=Math.round(scores.reduce((a,s)=> a + ((s.score/5)*(wMap[s.parameter_id]||0)),0));
  }
  const badgeLabel = weightedPct==null ? '' : weightedPct>=80?'Excellent':weightedPct>=65?'Good':weightedPct>=30?'Average':'Needs Improvement';
  const { buildOverallConclusion } = require('../overallConclusion');
  const conclusion = buildOverallConclusion({ weightedPct, badge:badgeLabel, scores, triNature });
  const filteredFeatures = selectedFeatures && Array.isArray(selectedFeatures) ? selectedFeatures : null;
  res.json({ hasProfile: !!profile, profile, triNature, interview, flags, conclusion, weightedPct, badge:badgeLabel, filteredFeatures });
});

router.get('/employees/:id/overall-conclusion', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
  let scores = [];
  let weightedPct = null;
  if (sc) {
    scores = db.prepare('SELECT s.score, p.name, p.id as parameter_id FROM scores s JOIN parameters p ON p.id=s.parameter_id WHERE s.scorecard_id=?').all(sc.id);
    const params = db.prepare('SELECT id, weightage FROM parameters').all();
    const wMap = Object.fromEntries(params.map(p=>[p.id,p.weightage]));
    weightedPct = Math.round(scores.reduce((a,s)=> a + ((s.score/5)*(wMap[s.parameter_id]||0)),0));
  }
  const badgeLabel = weightedPct==null ? '' : weightedPct>=80?'Excellent':weightedPct>=65?'Good':weightedPct>=30?'Average':'Needs Improvement';
  const profile = getProfile(req.params.id);
  let triNature = null;
  if (profile && profile.date_of_birth) {
    const name = profile.numerology_name || profile.full_name || emp.name;
    const user = db.prepare('SELECT resume_text FROM users WHERE id=?').get(emp.id);
    triNature = computeTriNature(name, profile.date_of_birth, user?user.resume_text:null);
  } else if (profile) {
    const name = profile.numerology_name || profile.full_name || emp.name;
    const user = db.prepare('SELECT resume_text FROM users WHERE id=?').get(emp.id);
    triNature = computeTriNature(name, null, user?user.resume_text:null);
  }
  const conclusion = buildOverallConclusion({ weightedPct, badge:badgeLabel, scores, triNature });
  res.json({ hasScorecard: !!sc, weightedPct, badge:badgeLabel, scores, triNature: triNature ? { signature: triNature.signature, elements: triNature.elements, triguna: triNature.triguna } : null, conclusion });
});

// Candidate-vs-company alignment (3 dimensions + overall) — single source of truth for Harmony
router.get('/employees/:id/numerology/company-match', (req, res) => {
  if (gate(req, res)) return;
  const emp = getEmployeeOr404(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const profile = getProfile(req.params.id);
  if (!profile) return res.json({ hasComparison: false });
  let company = null;
  if (req.query.companyId) {
    company = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(req.query.companyId);
  } else if (req.query.company_id) {
    company = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(req.query.company_id);
  } else {
    const user = db.prepare('SELECT job_description_id FROM users WHERE id = ?').get(req.params.id);
    if (user && user.job_description_id) {
      const jd = db.prepare('SELECT company_id FROM job_descriptions WHERE id = ?').get(user.job_description_id);
      if (jd && jd.company_id) company = db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(jd.company_id);
    }
    if (!company) company = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  }
  if (!company) return res.json({ hasComparison: false });
  const now = new Date().getFullYear();
  const candPy = numer.personalYearNumber(profile.date_of_birth, now);
  const candTheme = numer.PERSONAL_YEAR_THEMES[candPy];
  const compNum = company.founded_number != null ? company.founded_number : numer.foundedNumber(company.founded_year);
  const compTheme = numer.PERSONAL_YEAR_THEMES[compNum];
  const echo = numer.companyEcho(candPy, compNum);
  const supportNarrative = numer.companySupportNarrative(candPy, compNum, echo);
  const { buildAlignment } = require('../companyAlignment');
  let alignment = null;
  try { alignment = buildAlignment(profile, company); } catch (e) { alignment = null; }
  if (!alignment) {
    const { outcomeFor } = require('../numerologyOutcome');
    const diff = Math.abs((profile.life_path_number || 0) - compNum);
    const { tone, label } = outcomeFor(diff);
    alignment = { dimensions: [], overall: { diff, tone, label } };
  }
  res.json({
    hasComparison: true,
    candidate: { number: candPy, theme: candTheme ? candTheme.theme : null, composite: alignment ? alignment.candidateComposite : null, lifePath: profile.life_path_number, expression: profile.expression_number, birth: profile.birth_number },
    company: { id: company.id, name: company.client_name, number: compNum, theme: compTheme ? compTheme.theme : null, founded_number: company.founded_number, brand_number: company.brand_number, founder_number: company.founder_number },
    echo: echo.label,
    tone: echo.tone,
    diff: echo.diff,
    outcome: echo.label,
    supportNarrative,
    alignment,
    overall: alignment ? alignment.overall : { diff: echo.diff, tone: echo.tone, label: echo.label },
  });
});

module.exports = router;