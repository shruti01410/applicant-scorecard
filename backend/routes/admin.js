const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { weightedPct, loadScorecard } = require('../scoreUtils');
const { extractText } = require('../fileTextExtract');
const { extractKeywords, matchResumeToJD } = require('../capabilityMatch');
const { autoRateParameters } = require('../autoRate');
const { detectResumeFlags } = require('../resumeFlags');
const numer = require('../numerologyUtils');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const upload = multer({ storage: multer.memoryStorage() });

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.pdf', '.docx'].includes(ext);
    cb(ok ? null : new Error('Only PDF/DOCX accepted (10MB max)'), ok);
  },
});

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

function ensureDir(sub) {
  const dir = path.join(UPLOADS_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveBuffer(buffer, originalname, sub) {
  const dir = ensureDir(sub);
  const safe = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fname = `${Date.now()}-${safe}`;
  const full = path.join(dir, fname);
  fs.writeFileSync(full, buffer);
  return path.join('uploads', sub, fname).replace(/\\/g, '/');
}

// ---------------------------------------------------------------
// JD keyword helpers — the curated keyword set is the source of truth
// for resume comparison once it exists (see jd_keywords table).
// ---------------------------------------------------------------

function getJDKeywords(jdId, activeOnly) {
  const sql = activeOnly
    ? 'SELECT id, jd_id, keyword, source, mode, is_active, created_at FROM jd_keywords WHERE jd_id = ? AND is_active = 1 ORDER BY source, id'
    : 'SELECT id, jd_id, keyword, source, mode, is_active, created_at FROM jd_keywords WHERE jd_id = ? ORDER BY is_active DESC, source, id';
  return db.prepare(sql).all(jdId);
}

function getActiveJDKeywords(jdId) {
  return db.prepare('SELECT keyword, mode FROM jd_keywords WHERE jd_id = ? AND is_active = 1 ORDER BY id').all(jdId);
}

function syncJDKeywordsFromText(jdId, descriptionText) {
  const { extractStructured } = require('../capabilityMatch');
  const entities = extractStructured(descriptionText, { jd: true });
  const exists = db.prepare('SELECT 1 FROM jd_keywords WHERE jd_id = ? AND keyword = ? LIMIT 1');
  const insert = db.prepare('INSERT INTO jd_keywords (jd_id, keyword, source, mode, is_active) VALUES (?, ?, ?, ?, 1)');
  const seen = new Set();
  for (const e of entities) {
    const k = e.display.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (exists.get(jdId, k)) continue;
    insert.run(jdId, k, 'EXTRACTED', e.mode);
  }
}

function runCapabilityMatch(userId) {
  const user = db.prepare('SELECT resume_text, job_description_id FROM users WHERE id = ?').get(userId);
  if (!user || !user.resume_text || !user.job_description_id) return null;
  const jd = db.prepare('SELECT description_text FROM job_descriptions WHERE id = ?').get(user.job_description_id);
  if (!jd) return null;
  const jdKeywords = getActiveJDKeywords(user.job_description_id);
  const { pct, matched, missing, categories } = matchResumeToJD(jd.description_text, user.resume_text, { jdKeywords });
  const detail = JSON.stringify({ matched, missing, categories });
  db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(pct, detail, userId);
  return { pct, matched, missing, categories };
}

router.get('/parameters', (req, res) => {
  res.json(db.prepare('SELECT * FROM parameters ORDER BY id').all());
});

router.get('/employees', (req, res) => {
  const search = (req.query.search || '').trim();
  const favOnly = req.query.favorite === '1' || req.query.favorite === 'true';
  const archivedFilter = req.query.archived;
  let whereArchived = '';
  if (archivedFilter === '1' || archivedFilter === 'true') whereArchived = ' AND u.is_archived = 1';
  else if (archivedFilter === '0' || archivedFilter === 'false') whereArchived = ' AND (u.is_archived = 0 OR u.is_archived IS NULL)';
  const favWhere = favOnly ? ' AND u.is_favorite = 1' : '';
  let rows;
  const baseSelect = `
      SELECT u.id, u.name, u.email, u.job_description_id, u.capability_match_pct,
             u.is_favorite, u.is_archived,
             sc.applicant_name, sc.client, sc.position, sc.id AS scorecard_id
      FROM users u
      LEFT JOIN scorecards sc ON sc.employee_id = u.id
      WHERE u.role = 'employee'${whereArchived}${favWhere}`;
  if (search) {
    rows = db.prepare(`
      ${baseSelect}
        AND (u.name LIKE ? OR u.email LIKE ? OR sc.client LIKE ? OR sc.position LIKE ?)
      ORDER BY u.is_favorite DESC, u.name
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    rows = db.prepare(`${baseSelect} ORDER BY u.is_favorite DESC, u.name`).all();
  }

  const out = rows.map(r => {
    const scores = r.scorecard_id
      ? db.prepare(`
          SELECT s.score, p.weightage FROM scores s
          JOIN parameters p ON p.id = s.parameter_id
          WHERE s.scorecard_id = ?
        `).all(r.scorecard_id)
      : [];
    const history = r.scorecard_id
      ? db.prepare('SELECT updated_at FROM scorecard_updates WHERE scorecard_id = ? ORDER BY updated_at').all(r.scorecard_id)
      : [];
    return {
      id: r.id,
      applicant_name: r.applicant_name || r.name,
      email: r.email,
      client: r.client || '',
      position: r.position || '',
      weighted_pct: weightedPct(scores),
      scorecard_id: r.scorecard_id || null,
      updated_at_history: history.map(h => h.updated_at),
      job_description_id: r.job_description_id || null,
      capability_match_pct: r.capability_match_pct,
      is_favorite: !!r.is_favorite,
      is_archived: !!r.is_archived,
    };
  });

  res.json(out);
});

router.patch('/employees/:id/favorite', (req, res) => {
  const emp = db.prepare('SELECT id, is_favorite FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const next = emp.is_favorite ? 0 : 1;
  db.prepare('UPDATE users SET is_favorite = ? WHERE id = ?').run(next, emp.id);
  res.json({ is_favorite: !!next });
});

router.patch('/employees/:id/archive', (req, res) => {
  const emp = db.prepare('SELECT id, is_archived FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const next = emp.is_archived ? 0 : 1;
  db.prepare('UPDATE users SET is_archived = ? WHERE id = ?').run(next, emp.id);
  res.json({ is_archived: !!next });
});

router.delete('/employees/:id', (req, res) => {
  const emp = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  try {
    db.exec('BEGIN');
    const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
    if (sc) {
      db.prepare('DELETE FROM scores WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM scorecard_updates WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM scorecards WHERE id = ?').run(sc.id);
    }
    db.prepare('DELETE FROM numerology_profiles WHERE employee_id = ?').run(emp.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(emp.id);
    db.exec('COMMIT');
    res.json({ deleted: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    res.status(500).json({ error: e.message });
  }
});

router.get('/job-descriptions', (req, res) => {
  const archived = req.query.archived === '1' ? 'AND jd.is_archived = 1' : 'AND jd.is_archived = 0';
  const rows = db.prepare(`SELECT jd.id, jd.title, jd.client, jd.company_id, jd.is_favorite, jd.is_archived, jd.created_at, (SELECT COUNT(*) FROM jd_keywords k WHERE k.jd_id = jd.id AND k.is_active = 1) AS keyword_count FROM job_descriptions jd WHERE 1=1 ${archived} ORDER BY jd.is_favorite DESC, jd.created_at DESC`).all();
  res.json(rows);
});

router.get('/job-descriptions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job description not found' });
  try { row.requirements = row.requirements ? JSON.parse(row.requirements) : []; } catch (e) { row.requirements = []; }
  row.keywords = getJDKeywords(row.id);
  res.json(row);
});

// ---- JD favorite / archive / delete ----

router.post('/job-descriptions/:id/favorite', (req, res) => {
  const jd = db.prepare('SELECT id, is_favorite FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  const next = jd.is_favorite ? 0 : 1;
  db.prepare('UPDATE job_descriptions SET is_favorite = ? WHERE id = ?').run(next, jd.id);
  res.json({ id: jd.id, is_favorite: next });
});

router.post('/job-descriptions/:id/archive', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  db.prepare('UPDATE job_descriptions SET is_archived = 1 WHERE id = ?').run(jd.id);
  res.json({ id: jd.id, is_archived: 1 });
});

router.post('/job-descriptions/:id/restore', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  db.prepare('UPDATE job_descriptions SET is_archived = 0 WHERE id = ?').run(jd.id);
  res.json({ id: jd.id, is_archived: 0 });
});

router.delete('/job-descriptions/:id', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET job_description_id = NULL WHERE job_description_id = ?').run(jd.id);
    db.prepare('DELETE FROM jd_keywords WHERE jd_id = ?').run(jd.id);
    db.prepare('DELETE FROM job_descriptions WHERE id = ?').run(jd.id);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true, id: jd.id });
});

// ---- Editable JD keywords (source of truth for resume comparison) ----

router.post('/job-descriptions/:id/keywords', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  const keyword = String(req.body.keyword || '').trim();
  const mode = req.body.mode === 'preferred' ? 'preferred' : 'required';
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });
  const k = keyword.toLowerCase();
  const existing = db.prepare('SELECT id, is_active FROM jd_keywords WHERE jd_id = ? AND keyword = ?').get(jd.id, k);
  if (existing) {
    db.prepare('UPDATE jd_keywords SET is_active = 1, mode = ? WHERE id = ?').run(mode, existing.id);
  } else {
    db.prepare('INSERT INTO jd_keywords (jd_id, keyword, source, mode, is_active) VALUES (?, ?, ?, ?, 1)').run(jd.id, k, 'USER_ADDED', mode);
  }
  res.json({ keywords: getJDKeywords(jd.id) });
});

router.put('/job-descriptions/:id/keywords', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  const list = Array.isArray(req.body.keywords) ? req.body.keywords : [];
  const wanted = [];
  const seen = new Set();
  for (const item of list) {
    const raw = (typeof item === 'string' ? item : (item && item.keyword)) || '';
    const k = raw.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    wanted.push({ keyword: k, mode: (item && item.mode) === 'preferred' ? 'preferred' : 'required' });
  }
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE jd_keywords SET is_active = 0 WHERE jd_id = ?').run(jd.id);
    const find = db.prepare('SELECT id FROM jd_keywords WHERE jd_id = ? AND keyword = ?');
    const upd = db.prepare('UPDATE jd_keywords SET is_active = 1, mode = ? WHERE id = ?');
    const ins = db.prepare('INSERT INTO jd_keywords (jd_id, keyword, source, mode, is_active) VALUES (?, ?, ?, ?, 1)');
    for (const w of wanted) {
      const row = find.get(jd.id, w.keyword);
      if (row) upd.run(w.mode, row.id);
      else ins.run(jd.id, w.keyword, 'USER_ADDED', w.mode);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ error: e.message });
  }
  res.json({ keywords: getJDKeywords(jd.id) });
});

router.delete('/job-descriptions/:id/keywords/:keywordId', (req, res) => {
  const row = db.prepare('SELECT id FROM jd_keywords WHERE id = ? AND jd_id = ?').get(req.params.keywordId, req.params.id);
  if (!row) return res.status(404).json({ error: 'Keyword not found' });
  db.prepare('UPDATE jd_keywords SET is_active = 0 WHERE id = ?').run(row.id);
  res.json({ keywords: getJDKeywords(req.params.id) });
});

router.post('/job-descriptions/:id/keywords/reset', (req, res) => {
  const jd = db.prepare('SELECT id, description_text FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!jd) return res.status(404).json({ error: 'Job description not found' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM jd_keywords WHERE jd_id = ? AND source = ?').run(jd.id, 'USER_ADDED');
    db.prepare('UPDATE jd_keywords SET is_active = 0 WHERE jd_id = ?').run(jd.id);
    const { extractStructured } = require('../capabilityMatch');
    const entities = extractStructured(jd.description_text, { jd: true });
    const find = db.prepare('SELECT id FROM jd_keywords WHERE jd_id = ? AND keyword = ?');
    const upd = db.prepare('UPDATE jd_keywords SET is_active = 1, source = \'EXTRACTED\', mode = ? WHERE id = ?');
    const ins = db.prepare('INSERT INTO jd_keywords (jd_id, keyword, source, mode, is_active) VALUES (?, ?, ?, ?, 1)');
    const seen = new Set();
    for (const e of entities) {
      const k = e.display.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const row = find.get(jd.id, k);
      if (row) upd.run(e.mode, row.id);
      else ins.run(jd.id, k, 'EXTRACTED', e.mode);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ error: e.message });
  }
  res.json({ keywords: getJDKeywords(jd.id) });
});

router.post('/job-descriptions', uploadDoc.single('file'), async (req, res) => {
  try {
    let title = String(req.body.title || '').trim();
    let client = String(req.body.client || '').trim();
    let description_text = String(req.body.description_text || '').trim();
    let company_id = req.body.company_id ? Number(req.body.company_id) : null;
    let file_path = null;

    if (req.file) {
      const text = await extractText(req.file.buffer, req.file.originalname);
      if (!description_text) description_text = text;
      file_path = saveBuffer(req.file.buffer, req.file.originalname, 'jds');
      if (!title) title = path.parse(req.file.originalname).name;
    }

    if (!title || !description_text) return res.status(400).json({ error: 'title and description_text (or file) are required' });

    const requirements = extractKeywords(description_text);
    const info = db.prepare(
      'INSERT INTO job_descriptions (title, client, company_id, description_text, requirements, file_path) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(title, client || null, company_id, description_text, JSON.stringify(requirements), file_path);
    syncJDKeywordsFromText(info.lastInsertRowid, description_text);
    const row = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/job-descriptions/:id', uploadDoc.single('file'), async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Job description not found' });
    let title = req.body.title != null ? String(req.body.title).trim() : existing.title;
    let client = req.body.client != null ? String(req.body.client).trim() : existing.client;
    let company_id = req.body.company_id != null ? Number(req.body.company_id) : existing.company_id;
    let description_text = req.body.description_text != null ? String(req.body.description_text).trim() : existing.description_text;
    let file_path = existing.file_path;
    if (req.file) {
      const text = await extractText(req.file.buffer, req.file.originalname);
      description_text = text;
      file_path = saveBuffer(req.file.buffer, req.file.originalname, 'jds');
      if (!req.body.title) title = path.parse(req.file.originalname).name;
    }
    const requirements = extractKeywords(description_text);
    db.prepare('UPDATE job_descriptions SET title=?, client=?, company_id=?, description_text=?, requirements=?, file_path=? WHERE id=?').run(title, client, company_id, description_text, JSON.stringify(requirements), file_path, req.params.id);
    syncJDKeywordsFromText(req.params.id, description_text);
    const row = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/job-descriptions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job description not found' });
  const linked = db.prepare('SELECT id FROM users WHERE job_description_id = ? LIMIT 1').get(req.params.id);
  if (linked) return res.status(400).json({ error: 'Cannot delete — a candidate is linked to this JD' });
  db.prepare('DELETE FROM job_descriptions WHERE id = ?').run(req.params.id);
  if (existing.file_path) { try { fs.unlinkSync(path.join(__dirname, '..', existing.file_path)); } catch (e) {} }
  res.json({ deleted: true });
});

router.post('/employees', uploadDoc.fields([{ name: 'resume', maxCount: 1 }, { name: 'jd_file', maxCount: 1 }]), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    let job_description_id = req.body.job_description_id ? Number(req.body.job_description_id) : null;
    const position = String(req.body.position || req.body.role || '').trim();
    const client = String(req.body.client || '').trim();
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    const exists = db.prepare('SELECT id FROM users WHERE email = ? OR name = ?').get(email, name);
    if (exists) return res.status(409).json({ error: 'Candidate already exists' });

    const { makeUsername } = require('../database');
    let username = makeUsername(name);

    const resumeFile = req.files && req.files['resume'] ? req.files['resume'][0] : null;
    const jdFile = req.files && req.files['jd_file'] ? req.files['jd_file'][0] : null;

    if (jdFile) {
      const jdText = await extractText(jdFile.buffer, jdFile.originalname);
      const jdTitle = position || path.parse(jdFile.originalname).name;
      const jdClient = client || null;
      const requirements = extractKeywords(jdText);
      const jdFilePath = saveBuffer(jdFile.buffer, jdFile.originalname, 'jds');
      const info = db.prepare('INSERT INTO job_descriptions (title, client, description_text, requirements, file_path) VALUES (?, ?, ?, ?, ?)').run(jdTitle, jdClient, jdText, JSON.stringify(requirements), jdFilePath);
      job_description_id = Number(info.lastInsertRowid);
      syncJDKeywordsFromText(job_description_id, jdText);
    }

    let resume_file_path = null;
    let resume_text = null;
    if (resumeFile) {
      resume_text = await extractText(resumeFile.buffer, resumeFile.originalname);
      resume_file_path = saveBuffer(resumeFile.buffer, resumeFile.originalname, 'resumes');
    }

    const insert = db.prepare('INSERT INTO users (username, password, role, name, email, job_description_id, resume_file_path, resume_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insert.run(username, bcrypt.hashSync('12345', 10), 'employee', name, email, job_description_id, resume_file_path, resume_text);
    const user = db.prepare('SELECT id, name, email, job_description_id, capability_match_pct FROM users WHERE email = ?').get(email);

    let autoScores = null;
    if (resume_text && job_description_id) {
      const jd = db.prepare('SELECT description_text, title FROM job_descriptions WHERE id = ?').get(job_description_id);
      if (jd) {
        const { pct, matched, missing, categories } = matchResumeToJD(jd.description_text, resume_text, { jdKeywords: getActiveJDKeywords(job_description_id) });
        db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(pct, JSON.stringify({ matched, missing, categories }), user.id);
        user.capability_match_pct = pct;
        const numerologyProfile = db.prepare('SELECT life_path_number FROM numerology_profiles WHERE employee_id = ? AND dimension = ?').get(user.id, 'candidate');
        const lifePath = numerologyProfile ? numerologyProfile.life_path_number : null;
        autoScores = autoRateParameters({ jdText: jd.description_text, resumeText: resume_text, candidateName: name, jobTitle: position || jd.title, lifePath });
        const targetClient = client || jd.client || null;
        const targetPosition = position || jd.title || null;
        const existingSc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(user.id);
        let scorecardId;
        if (existingSc) {
          db.prepare('UPDATE scorecards SET applicant_name = ?, email = ?, client = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, email, targetClient, targetPosition, existingSc.id);
          scorecardId = existingSc.id;
          db.prepare('DELETE FROM scores WHERE scorecard_id = ?').run(scorecardId);
        } else {
          const info = db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (?, ?, ?, ?, ?)').run(user.id, name, email, targetClient, targetPosition);
          scorecardId = Number(info.lastInsertRowid);
        }
        const insertScore = db.prepare('INSERT INTO scores (scorecard_id, parameter_id, score) VALUES (?, ?, ?)');
        autoScores.forEach(s => insertScore.run(scorecardId, s.parameter_id, s.score));
        db.prepare('INSERT INTO scorecard_updates (scorecard_id, source) VALUES (?, ?)').run(scorecardId, 'numerology_suggested');
        user.auto_rated = true;
        user.auto_scores = autoScores;
      }
    } else if (position || client) {
      const jdTitle = job_description_id ? (db.prepare('SELECT title, client FROM job_descriptions WHERE id = ?').get(job_description_id) || {}) : {};
      const targetClient = client || jdTitle.client || null;
      const targetPosition = position || jdTitle.title || null;
      if (targetClient || targetPosition) {
        db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (?, ?, ?, ?, ?)').run(user.id, name, email, targetClient, targetPosition);
      }
    }

    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/employees/:id/resume', uploadDoc.single('resume'), async (req, res) => {
  try {
    const emp = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    if (!req.file) return res.status(400).json({ error: 'No resume file uploaded' });
    const job_description_id = req.body.job_description_id ? Number(req.body.job_description_id) : null;
    const resume_text = await extractText(req.file.buffer, req.file.originalname);
    const resume_file_path = saveBuffer(req.file.buffer, req.file.originalname, 'resumes');
    if (job_description_id) {
      db.prepare('UPDATE users SET resume_file_path = ?, resume_text = ?, job_description_id = ? WHERE id = ?').run(resume_file_path, resume_text, job_description_id, emp.id);
    } else {
      db.prepare('UPDATE users SET resume_file_path = ?, resume_text = ? WHERE id = ?').run(resume_file_path, resume_text, emp.id);
    }
    const result = runCapabilityMatch(emp.id);
    const user = db.prepare('SELECT id, capability_match_pct, capability_match_detail FROM users WHERE id = ?').get(emp.id);
    let detail = null;
    try { detail = user.capability_match_detail ? JSON.parse(user.capability_match_detail) : null; } catch (e) {}
    res.json({ resume_file_path, capability_match_pct: user.capability_match_pct, capability_match_detail: detail, matched: result ? result.matched : [], missing: result ? result.missing : [] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/employees/:id/capability-match', (req, res) => {
  try {
    const emp = db.prepare('SELECT id, resume_text, job_description_id, capability_match_pct, capability_match_detail FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    if (!emp.resume_text || !emp.job_description_id) {
      return res.json({ pct: null, matched: [], missing: [], categories: {}, overall: null, flags: [], message: 'Resume or JD not linked yet' });
    }
    const jd = db.prepare('SELECT description_text FROM job_descriptions WHERE id = ?').get(emp.job_description_id);
    if (!jd) return res.status(404).json({ error: 'Job description not found' });
    const jdKeywords = getActiveJDKeywords(emp.job_description_id);
    const match = matchResumeToJD(jd.description_text, emp.resume_text, { jdKeywords });
    let stored = null;
    try { stored = emp.capability_match_detail ? JSON.parse(emp.capability_match_detail) : null; } catch (e) {}
    const flags = (stored && stored.flags && stored.flags.length) ? stored.flags : detectResumeFlags(emp.resume_text, jd.description_text, { pct: match.pct, matched: match.matched, missing: match.missing });
    const body = { ...match, jdId: emp.job_description_id, flags, hiringSignals: match.hiringSignals || match.matched };
    db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(match.pct, JSON.stringify(body), emp.id);
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/employees/:id/auto-rate', uploadDoc.single('resume'), async (req, res) => {
  try {
    const emp = db.prepare('SELECT id, name, resume_text, job_description_id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    let resumeText = emp.resume_text;
    let jobDescId = req.body.job_description_id ? Number(req.body.job_description_id) : emp.job_description_id;
    const position = String(req.body.position || req.body.role || '').trim();
    if (req.file) {
      resumeText = await extractText(req.file.buffer, req.file.originalname);
      const fp = saveBuffer(req.file.buffer, req.file.originalname, 'resumes');
      db.prepare('UPDATE users SET resume_text = ?, resume_file_path = ? WHERE id = ?').run(resumeText, fp, emp.id);
    }
    if (jobDescId && jobDescId !== emp.job_description_id) {
      db.prepare('UPDATE users SET job_description_id = ? WHERE id = ?').run(jobDescId, emp.id);
    }
    if (!resumeText || !jobDescId) return res.status(400).json({ error: 'Need both JD and resume to auto-rate. Upload resume and select a JD.' });
    const jd = db.prepare('SELECT description_text, title FROM job_descriptions WHERE id = ?').get(jobDescId);
    if (!jd) return res.status(404).json({ error: 'Job description not found' });
    const { pct, matched, missing, categories } = matchResumeToJD(jd.description_text, resumeText, { jdKeywords: getActiveJDKeywords(jobDescId) });
    db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(pct, JSON.stringify({ matched, missing, categories }), emp.id);
    const profile = db.prepare('SELECT life_path_number FROM numerology_profiles WHERE employee_id = ? AND dimension = ?').get(emp.id, 'candidate');
    const lifePath = profile ? profile.life_path_number : numer.nameNumber(emp.name);
    const scores = autoRateParameters({ jdText: jd.description_text, resumeText, candidateName: emp.name, jobTitle: position || jd.title, lifePath });
    db.exec('BEGIN');
    const existingSc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
    let scorecardId;
    if (existingSc) {
      db.prepare('DELETE FROM scores WHERE scorecard_id = ?').run(existingSc.id);
      scorecardId = existingSc.id;
      if (position) db.prepare('UPDATE scorecards SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(position, scorecardId);
    } else {
      const info = db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (?, ?, ?, ?, ?)').run(emp.id, emp.name, '', null, position || jd.title);
      scorecardId = Number(info.lastInsertRowid);
    }
    const insertScore = db.prepare('INSERT INTO scores (scorecard_id, parameter_id, score) VALUES (?, ?, ?)');
    scores.forEach(s => insertScore.run(scorecardId, s.parameter_id, s.score));
    db.prepare('INSERT INTO scorecard_updates (scorecard_id, source) VALUES (?, ?)').run(scorecardId, 'numerology_suggested');
    db.exec('COMMIT');
    const sc = loadScorecard(emp.id);
    res.json({ capability_match_pct: pct, matched, missing, scores: sc.scores, scorecard: sc, auto_rated: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    res.status(400).json({ error: e.message });
  }
});

router.get('/employees/:id/scorecard', (req, res) => {
  const emp = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const sc = loadScorecard(req.params.id);
  if (!sc) return res.json({ scorecard: null, scores: [] });

  res.json({ scorecard: sc, scores: sc.scores });
});

router.post('/employees/:id/scorecard', (req, res) => {
  const emp = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const {
    applicant_name, email, client, position,
    jd_shared, jd_shared_date, remarks, scores, source,
  } = req.body;

  if (!applicant_name) return res.status(400).json({ error: 'applicant_name is required' });
  const updateSource = source === 'numerology_suggested' ? 'numerology_suggested' : 'manual';

  try {
    db.exec('BEGIN');

    const existing = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);

    let scorecardId;
    if (existing) {
      db.prepare(`
        UPDATE scorecards SET applicant_name = ?, email = ?, client = ?, position = ?,
               jd_shared = ?, jd_shared_date = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(applicant_name, email || null, client || null, position || null,
             jd_shared ? 1 : 0, jd_shared_date || null, remarks || null, existing.id);
      scorecardId = existing.id;
      db.prepare('DELETE FROM scores WHERE scorecard_id = ?').run(scorecardId);
    } else {
      const info = db.prepare(`
        INSERT INTO scorecards (employee_id, applicant_name, email, client, position, jd_shared, jd_shared_date, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(emp.id, applicant_name, email || null, client || null, position || null,
             jd_shared ? 1 : 0, jd_shared_date || null, remarks || null);
      scorecardId = Number(info.lastInsertRowid);
    }

    const cleanScores = (scores || []).map(s => {
      let score = Number(s.score);
      if (!Number.isFinite(score) || score < 1) score = 3;
      if (score > 5) score = 5;
      score = Math.round(score);
      return { parameter_id: Number(s.parameter_id), score };
    });
    for (const s of cleanScores) {
      if (!s.parameter_id || s.score < 1 || s.score > 5) {
        throw new Error(`Score for parameter ${s.parameter_id} must be 1-5 (got ${s.score})`);
      }
    }
    const insertScore = db.prepare(
      'INSERT INTO scores (scorecard_id, parameter_id, score) VALUES (?, ?, ?)'
    );
    cleanScores.forEach(s => insertScore.run(scorecardId, s.parameter_id, s.score));

    db.prepare('INSERT INTO scorecard_updates (scorecard_id, source) VALUES (?, ?)').run(scorecardId, updateSource);

    db.exec('COMMIT');

    const sc = loadScorecard(emp.id);
    res.json({ scorecard: sc, scores: sc.scores });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    const isCheck = String(e.message).includes('CHECK constraint');
    const msg = isCheck ? 'Each rating must be 1-5 stars — please rate all parameters before saving.' : e.message;
    res.status(isCheck ? 400 : 500).json({ error: msg });
  }
});

router.post('/upload-excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse Excel file' });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const getAllUsernames = () => db.prepare('SELECT username FROM users').all().map(u => u.username);
  const findUser = db.prepare('SELECT id, name FROM users WHERE email = ?');
  const insertUser = db.prepare(
    'INSERT INTO users (username, password, role, name, email) VALUES (?, ?, ?, ?, ?)'
  );

  const uniqueEmail = (email) => {
    let username = (email || 'candidate').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'candidate';
    const usernames = getAllUsernames();
    let base = username;
    let counter = 1;
    while (usernames.includes(username)) username = base + counter++;
    return username;
  };

  const results = [];
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name     = String(row.Name || row.name || '').trim();
    const email    = String(row.Email || row.email || '').trim();
    const client   = String(row.Client || row.client || '').trim();
    const position = String(row.Position || row.position || '').trim();

    if (!name) continue;

    const existing = email ? findUser.get(email) : null;

    if (existing) {
      if (client || position) {
        db.prepare(`
          UPDATE scorecards SET client = ?, position = ?
          WHERE employee_id = ?
        `).run(client || null, position || null, existing.id);
      }
      results.push({ name, email, status: 'updated' });
      updated++;
    } else {
      const username = uniqueEmail(email);
      insertUser.run(username, bcrypt.hashSync('12345', 10), 'employee', name, email);
      created++;
      results.push({ name, email, status: 'created' });
    }
  }

  res.json({
    results,
    updated,
    created,
    message: `${updated} record(s) updated. ${created} new employee(s) created from Excel.`,
  });
});

module.exports = router;
