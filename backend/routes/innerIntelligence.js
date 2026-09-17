const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const numer = require('../numerologyUtils');
const { computeTriNature } = require('../triNatureEngine');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// No feature-flag gate — this dashboard is always available to admins.

function resolveCompany(userId) {
  const user = db.prepare('SELECT company_id, job_description_id FROM users WHERE id = ?').get(userId);
  if (user && user.company_id) {
    return db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(user.company_id);
  }
  if (user && user.job_description_id) {
    const jd = db.prepare('SELECT company_id FROM job_descriptions WHERE id = ?').get(user.job_description_id);
    if (jd && jd.company_id) {
      return db.prepare('SELECT * FROM company_numerology_profiles WHERE id = ?').get(jd.company_id);
    }
  }
  return db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
}

function getDeepParams(employeeId) {
  const profile = db.prepare(
    'SELECT * FROM numerology_profiles WHERE employee_id = ? AND dimension = ?'
  ).get(employeeId, 'candidate');
  if (!profile || !profile.life_path_number) return null;
  const company = resolveCompany(employeeId);
  const emp = db.prepare('SELECT name FROM users WHERE id = ?').get(employeeId);
  return numer.computeNumoParameters(profile, company, emp ? emp.name : '');
}

function getTriNature(employeeId) {
  const profile = db.prepare(
    'SELECT * FROM numerology_profiles WHERE employee_id = ? AND dimension = ?'
  ).get(employeeId, 'candidate');
  if (!profile) return null;
  const emp = db.prepare('SELECT name FROM users WHERE id = ?').get(employeeId);
  if (!emp) return null;
  const name = profile.numerology_name || profile.full_name || emp.name;
  const dob = profile.date_of_birth;
  const user = db.prepare('SELECT resume_text FROM users WHERE id = ?').get(employeeId);
  return computeTriNature(name, dob, user ? user.resume_text : null);
}

function getCompanyForEmployee(employeeId) {
  const user = db.prepare('SELECT company_id, job_description_id FROM users WHERE id = ?').get(employeeId);
  if (user && user.company_id) {
    return db.prepare('SELECT id, client_name FROM company_numerology_profiles WHERE id = ?').get(user.company_id);
  }
  if (user && user.job_description_id) {
    const jd = db.prepare('SELECT company_id FROM job_descriptions WHERE id = ?').get(user.job_description_id);
    if (jd && jd.company_id) {
      return db.prepare('SELECT id, client_name FROM company_numerology_profiles WHERE id = ?').get(jd.company_id);
    }
  }
  const first = db.prepare('SELECT id, client_name FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  return first;
}

function buildCandidateSummary(emp) {
  const params = getDeepParams(emp.id);
  const hasProfile = params && params[0] && params[0].diff !== null;
  const topParam = params && params.length
    ? params.reduce((best, p) => p.score > best.score ? p : best, params[0])
    : null;

  const tri = getTriNature(emp.id);
  const hasTri = tri && tri.hasProfile;

  return {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    company_id: emp.company_id || emp.jd_company_id,
    company_name: emp.company_name || null,
    jd_id: emp.job_description_id,
    jd_title: emp.jd_title || null,
    hasProfile,
    deep_params: params || [],
    top_parameter: topParam && hasProfile ? { name: topParam.name, score: topParam.score, tone: topParam.tone } : null,
    avg_score: params && hasProfile ? Math.round(params.reduce((a, p) => a + p.score, 0) / params.length * 10) / 10 : null,
    tri_nature: hasTri ? {
      signature: tri.signature,
      elements: tri.elements,
      triguna: tri.triguna,
      dominantElement: tri.dominantElement,
      dominantMode: tri.dominantMode,
      categories: tri.categories,
      parameters: tri.parameters,
      core: tri.core,
    } : null,
  };
}

// GET /api/admin/inner-intelligence/candidates
router.get('/candidates', (req, res) => {
  let sql = `
    SELECT u.id, u.name, u.email, u.company_id, u.job_description_id,
           jd.title as jd_title, jd.company_id as jd_company_id,
           cnp.client_name as company_name
    FROM users u
    LEFT JOIN job_descriptions jd ON jd.id = u.job_description_id
    LEFT JOIN company_numerology_profiles cnp ON cnp.id = COALESCE(u.company_id, jd.company_id)
    WHERE u.role = 'employee'
  `;
  const params = [];

  if (req.query.jdId) {
    sql += ' AND u.job_description_id = ?';
    params.push(Number(req.query.jdId));
  }
  if (req.query.companyId) {
    sql += ' AND COALESCE(u.company_id, jd.company_id) = ?';
    params.push(Number(req.query.companyId));
  }

  sql += ' ORDER BY u.name ASC';
  const rows = db.prepare(sql).all(...params);

  const results = rows.map(emp => buildCandidateSummary(emp));

  // Sort
  const sortBy = req.query.sortBy || 'name';
  const order = req.query.order === 'asc' ? 1 : -1;

  results.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name) * order;
    if (sortBy === 'paramScore' || sortBy === 'avg') return ((a.avg_score || 0) - (b.avg_score || 0)) * order;
    const paramMap = { stillness: 0, luck: 1, harmony: 2, destiny: 3, karmic: 4, intuition: 5 };
    const idx = paramMap[sortBy];
    if (idx != null) {
      const sa = a.deep_params[idx] ? a.deep_params[idx].score : 0;
      const sb = b.deep_params[idx] ? b.deep_params[idx].score : 0;
      return (sa - sb) * order;
    }
    return 0;
  });

  const withProfile = results.filter(r => r.hasProfile).length;
  const companies = [...new Set(results.map(r => r.company_name).filter(Boolean))];
  const jds = [...new Set(results.map(r => r.jd_title).filter(Boolean))];

  res.json({
    candidates: results,
    summary: { total: results.length, evaluated: withProfile, companies, jds },
  });
});

// GET /api/admin/inner-intelligence/candidates/:id
router.get('/candidates/:id', (req, res) => {
  const emp = db.prepare('SELECT id, name, email, company_id, job_description_id FROM users WHERE id = ? AND role = ?')
    .get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });

  const company = getCompanyForEmployee(emp.id);
  const summary = buildCandidateSummary({ ...emp, company_id: emp.company_id, jd_company_id: emp.job_description_id, company_name: company?.client_name });
  summary.company = company;

  res.json(summary);
});

// POST /api/admin/inner-intelligence/compare
router.post('/compare', (req, res) => {
  const ids = (req.body.candidateIds || []).map(Number).filter(n => n > 0);
  if (ids.length < 2 || ids.length > 5) {
    return res.status(400).json({ error: 'Select 2–5 candidates to compare' });
  }

  const candidates = ids.map(id => {
    const emp = db.prepare('SELECT id, name, email, company_id, job_description_id FROM users WHERE id = ? AND role = ?')
      .get(id, 'employee');
    if (!emp) return null;
    return buildCandidateSummary(emp);
  }).filter(Boolean);

  res.json({ candidates });
});

// GET /api/admin/inner-intelligence/jds
router.get('/jds', (req, res) => {
  const rows = db.prepare('SELECT id, title FROM job_descriptions ORDER BY title').all();
  res.json(rows);
});

// GET /api/admin/inner-intelligence/companies
router.get('/companies', (req, res) => {
  const rows = db.prepare('SELECT id, client_name FROM company_numerology_profiles ORDER BY client_name').all();
  res.json(rows);
});

module.exports = router;
