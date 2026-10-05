const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { weightedPct, loadScorecard } = require('../scoreUtils');
const decisionService = require('../decisionService');
const { extractText } = require('../fileTextExtract');
const { extractKeywords, matchResumeToJD } = require('../capabilityMatch');
const jdValidation = require('../jdValidation');
const { autoRateParameters, autoRateSopParameters: legacyAutoRateSopParameters, autoRateEnhanced } = require('../autoRate');
const { autoRateSopParameters } = require('../sopAutoRate');
const { detectResumeFlags } = require('../resumeFlags');
const numer = require('../numerologyUtils');
const resumeValidation = require('../resumeValidation');
const { analyzeResume } = require('../resumeIntegrityAnalyzer');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.xlsx', '.xls'].includes(ext);
    cb(ok ? null : new Error('Only .xlsx/.xls accepted (5MB max)'), ok);
  },
});

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.pdf', '.doc', '.docx'].includes(ext);
    cb(ok ? null : new Error('Only PDF/DOC/DOCX accepted (10MB max)'), ok);
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

function evidenceWithGaps(s) {
  const items = Array.isArray(s.evidence) ? s.evidence.map((e) => ({ ...e })) : [];
  (s.gaps || []).forEach((g) => items.push({ source: 'gap', type: 'gap', strength: 'weak', text: g }));
  return items;
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
  const match = matchResumeToJD(jd.description_text, user.resume_text, { jdKeywords });
  const { pct, matched, missing, categories, requirements, mustHave } = match;
  const detail = JSON.stringify({ matched, missing, categories, requirements, mustHave });
  db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(pct, detail, userId);
  return { pct, matched, missing, categories, requirements, mustHave };
}

// Auto-rate the SOP PERSON/ROLE params when a candidate has JD + resume but no
// scores yet. Idempotent: only runs when zero active non-DEAL scores exist, so a
// recruiter's manual ratings (or a prior auto-rate) are never overwritten by
// this hook. Returns the persisted scores, or null if not applicable.
function sopAutoRateIfMissing(userId) {
  const user = db.prepare('SELECT id, name, resume_text, job_description_id FROM users WHERE id = ? AND role = ?').get(userId, 'employee');
  if (!user || !user.resume_text || String(user.resume_text).trim().length === 0 || !user.job_description_id) return null;
  const sc = db.prepare('SELECT id, position FROM scorecards WHERE employee_id = ?').get(userId);
  if (!sc) return null;
  const existing = db.prepare(`
    SELECT COUNT(*) AS c FROM scores s
    JOIN parameters p ON p.id = s.parameter_id
    WHERE s.scorecard_id = ? AND p.status = 'active' AND p.grp != 'DEAL' AND s.score IS NOT NULL
  `).get(sc.id);
  if (existing.c > 0) return null;
  const jd = db.prepare('SELECT description_text, title FROM job_descriptions WHERE id = ?').get(user.job_description_id);
  if (!jd) return null;
  const pct = (db.prepare('SELECT capability_match_pct FROM users WHERE id = ?').get(userId)).capability_match_pct;
  const sopScores = autoRateSopParameters({ jdText: jd.description_text, resumeText: user.resume_text, jobTitle: sc.position || jd.title });
  db.exec('BEGIN');
  try {
    const insertScore = db.prepare('INSERT INTO scores (scorecard_id, parameter_id, score, status) VALUES (?, ?, ?, ?)');
    sopScores.forEach(s => insertScore.run(sc.id, s.parameter_id, s.score, s.status || 'active'));
    const insertEvidence = db.prepare('INSERT INTO parameter_evidence (scorecard_id, parameter_id, score, confidence, evidence_items, source, reason, jd_match_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    sopScores.forEach(s => insertEvidence.run(sc.id, s.parameter_id, s.score, s.confidence == null ? 0 : s.confidence, JSON.stringify(evidenceWithGaps(s)), 'auto', s.reason || null, pct));
    db.prepare('INSERT INTO scorecard_updates (scorecard_id, source) VALUES (?, ?)').run(sc.id, 'auto');
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    throw e;
  }
  return sopScores;
}

router.get('/parameters', (req, res) => {
  res.json(db.prepare(`SELECT id, name, description, weightage, grp, status FROM parameters WHERE status = 'active' ORDER BY id`).all());
});

router.get('/employees', (req, res) => {
  const search = (req.query.search || '').trim();
  const favOnly = req.query.favorite === '1' || req.query.favorite === 'true';
  const archivedFilter = req.query.archived;
  let whereArchived = '';
  if (archivedFilter === '1' || archivedFilter === 'true') whereArchived = ' AND u.is_archived = 1';
  else if (archivedFilter === '0' || archivedFilter === 'false') whereArchived = ' AND (u.is_archived = 0 OR u.is_archived IS NULL)';
  const favWhere = favOnly ? ' AND u.is_favorite = 1' : '';
  const deletedFilter = req.query.deleted;
  const includeDeleted = req.query.include_deleted === '1' || req.query.include_deleted === 'true';
  let whereDeleted = '';
  if (deletedFilter === '1' || deletedFilter === 'true') whereDeleted = ' AND u.is_deleted = 1';
  else if (!includeDeleted) whereDeleted = ' AND (u.is_deleted = 0 OR u.is_deleted IS NULL)';
  let rows;
  const orgWhere = (req.user && req.user.organization_id != null) ? ` AND u.organization_id = ${Number(req.user.organization_id)}` : '';
  const baseSelect = `
      SELECT u.id, u.name, u.email, u.job_description_id, u.capability_match_pct,
             u.is_favorite, u.is_archived, u.is_deleted, u.deleted_at, u.company_id, u.organization_id,
             sc.applicant_name, sc.client, sc.position, sc.id AS scorecard_id,
             cnp.client_name AS company_name
      FROM users u
      LEFT JOIN scorecards sc ON sc.employee_id = u.id
      LEFT JOIN company_numerology_profiles cnp ON cnp.id = u.company_id
      WHERE u.role = 'employee'${orgWhere}${whereArchived}${whereDeleted}${favWhere}`;
  if (search) {
    rows = db.prepare(`
      ${baseSelect}
        AND (u.name LIKE ? OR u.email LIKE ? OR sc.client LIKE ? OR sc.position LIKE ? OR cnp.client_name LIKE ?)
      ORDER BY u.is_favorite DESC, u.name
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    rows = db.prepare(`${baseSelect} ORDER BY u.is_favorite DESC, u.name`).all();
  }

  const out = rows.map(r => {
    const scores = r.scorecard_id
      ? db.prepare(`
          SELECT s.score, p.weightage, p.status AS pstatus FROM scores s
          JOIN parameters p ON p.id = s.parameter_id
          WHERE s.scorecard_id = ?
        `).all(r.scorecard_id)
      : [];
    const history = r.scorecard_id
      ? db.prepare('SELECT updated_at FROM scorecard_updates WHERE scorecard_id = ? ORDER BY updated_at').all(r.scorecard_id)
      : [];
    if (r.scorecard_id && r.capability_match_pct != null) {
      try { sopAutoRateIfMissing(r.id); } catch (e) { /* non-blocking; auto-rate errors surface on the per-candidate screen */ }
    }
    const summary = r.scorecard_id ? decisionService.summaryForRow(r.id) : {
      pursuit_priority: null, candidate_fit: null, joining_probability: null,
      confidence_score: null, person_score: null, role_score: null, deal_score: null,
      final_decision: null, base_band: null, weighted_pct: null,
    };
    return {
      id: r.id,
      applicant_name: r.applicant_name || r.name,
      email: r.email,
      client: r.client || '',
      position: r.position || '',
      weighted_pct: summary.weighted_pct != null ? summary.weighted_pct : weightedPct(scores),
      scorecard_id: r.scorecard_id || null,
      updated_at_history: history.map(h => h.updated_at),
      job_description_id: r.job_description_id || null,
      capability_match_pct: r.capability_match_pct,
      is_favorite: !!r.is_favorite,
      is_archived: !!r.is_archived,
      is_deleted: !!r.is_deleted,
      deleted_at: r.deleted_at || null,
      company_id: r.company_id || null,
      company_name: r.company_name || null,
      pursuit_priority: summary.pursuit_priority,
      candidate_fit: summary.candidate_fit,
      joining_probability: summary.joining_probability,
      confidence_score: summary.confidence_score,
      person_score: summary.person_score,
      role_score: summary.role_score,
      deal_score: summary.deal_score,
      final_decision: summary.final_decision,
      base_band: summary.base_band,
    };
  });

  res.json(out);
});

router.post('/candidates/compare', (req, res) => {
  const { candidateIds } = req.body;
  if (!Array.isArray(candidateIds) || candidateIds.length < 2 || candidateIds.length > 5) {
    return res.status(400).json({ error: 'Provide between 2 and 5 candidate IDs' });
  }

  const ids = candidateIds.map(Number).filter(n => n > 0);
  if (ids.length < 2) return res.status(400).json({ error: 'Provide between 2 and 5 candidate IDs' });

  const allParams = db.prepare('SELECT id, name, description, weightage FROM parameters WHERE status = \'active\' ORDER BY id').all();

  const candidates = [];
  for (const id of ids) {
    const emp = db.prepare(`
      SELECT u.id, u.name, u.email, u.date_of_birth, u.job_description_id, u.capability_match_pct,
             sc.applicant_name, sc.client, sc.position, sc.id AS scorecard_id
      FROM users u
      LEFT JOIN scorecards sc ON sc.employee_id = u.id
      WHERE u.id = ? AND u.role = 'employee'
    `).get(id);
    if (!emp) return res.status(404).json({ error: `Candidate not found: ${id}` });

    const scores = emp.scorecard_id
      ? db.prepare(`
          SELECT s.parameter_id, s.score, p.name, p.description, p.weightage
          FROM scores s
          JOIN parameters p ON p.id = s.parameter_id
          WHERE s.scorecard_id = ? AND p.status = 'active'
          ORDER BY p.id
        `).all(emp.scorecard_id)
      : [];

    const scoreMap = Object.fromEntries(scores.map(s => [s.parameter_id, s]));
    const fullScores = allParams.map(p => {
      const s = scoreMap[p.id] || { score: null };
      return {
        parameter_id: p.id,
        name: p.name,
        description: p.description,
        weightage: p.weightage,
        score: s.score,
        weighted_contribution: s.score == null ? null : Math.round((s.score / 100) * p.weightage * 10) / 10,
      };
    });

    const pct = scores.length ? Math.round(scores.reduce((a, s) => a + ((s.score == null ? 0 : s.score / 100) * (s.weightage || 0)), 0)) : null;
    let badgeLabel, badgeColor;
    if (pct == null) { badgeLabel = 'Not scored'; badgeColor = '#9CA3AF'; }
    else if (pct >= 70) { badgeLabel = 'Strong'; badgeColor = '#15803d'; }
    else if (pct >= 50) { badgeLabel = 'Good'; badgeColor = '#16a34a'; }
    else if (pct >= 30) { badgeLabel = 'Moderate'; badgeColor = '#f59e0b'; }
    else { badgeLabel = 'Low'; badgeColor = '#ef4444'; }

    candidates.push({
      id: emp.id,
      name: emp.applicant_name || emp.name,
      email: emp.email,
      client: emp.client || '',
      position: emp.position || '',
      weighted_pct: pct,
      badge: { label: badgeLabel, color: badgeColor },
      capability_match_pct: emp.capability_match_pct || null,
      date_of_birth: emp.date_of_birth || null,
      job_description_id: emp.job_description_id || null,
      scores: fullScores,
    });
  }

  res.json({ candidates });
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
  const { users } = require('../repositories');
  const emp = users.findEmployeeWithProfile(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  // Soft-delete: keep row + scores/history for later retrieval
  const alreadyDeleted = emp.is_deleted === 1 || emp.is_deleted === true;
  if (alreadyDeleted) return res.json({ deleted: true, already_deleted: true });
  try {
    db.prepare(`UPDATE users SET is_deleted = 1, deleted_at = datetime('now'), is_archived = 1 WHERE id = ?`).run(emp.id);
    require('../audit').logAudit({
      performedBy: req.user.id,
      username: req.user.username,
      action: 'candidate_deleted',
      targetType: 'user',
      targetId: emp.id,
      module: 'candidates',
      detail: { name: emp.name, email: emp.email, soft: true },
      req,
    });
    res.json({ deleted: true, soft: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk soft-delete (Decision Center multi-select). Same semantics as the single
// DELETE /employees/:id above — reversible via POST /employees/:id/restore.
// Registered before the other /employees/:id/* routes so "bulk-delete" is never
// captured as an :id.
router.post('/employees/bulk-delete', (req, res) => {
  const raw = req.body && req.body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array of candidate ids' });
  }
  const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids must contain positive integers' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: 'Maximum 200 candidates per bulk delete' });
  }

  const placeholders = ids.map(() => '?').join(',');
  // role='employee' guard: never lets an admin id slip through and delete an admin.
  const rows = db
    .prepare(
      `SELECT id, name, email, is_deleted FROM users
        WHERE role = 'employee' AND id IN (${placeholders})`
    )
    .all(...ids);

  const alreadyDeleted = rows.filter((r) => r.is_deleted).map((r) => r.id);
  const targets = rows.filter((r) => !r.is_deleted);

  if (targets.length === 0) {
    return res.json({
      deleted: 0,
      already_deleted: alreadyDeleted.length,
      not_found: ids.length - rows.length,
      ids: [],
    });
  }

  try {
    db.exec('BEGIN');
    const upd = db.prepare(
      `UPDATE users SET is_deleted = 1, deleted_at = datetime('now'), is_archived = 1 WHERE id = ?`
    );
    targets.forEach((r) => upd.run(r.id));
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch (ignored) {
      /* rollback of a failed BEGIN */
    }
    return res.status(500).json({ error: e.message });
  }

  require('../audit').logAudit({
    performedBy: req.user.id,
    username: req.user.username,
    action: 'candidate_deleted',
    targetType: 'bulk',
    targetId: null,
    module: 'candidates',
    detail: { count: targets.length, ids: targets.map((r) => r.id), soft: true, bulk: true },
    req,
  });

  res.json({
    deleted: targets.length,
    already_deleted: alreadyDeleted.length,
    not_found: ids.length - rows.length,
    ids: targets.map((r) => r.id),
  });
});

router.post('/employees/:id/restore', (req, res) => {
  const { users } = require('../repositories');
  const emp = db.prepare('SELECT id, name, email, is_deleted FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (!emp.is_deleted) return res.json({ restored: true, already_active: true });
  try {
    db.prepare(`UPDATE users SET is_deleted = 0, deleted_at = NULL WHERE id = ?`).run(emp.id);
    require('../audit').logAudit({
      performedBy: req.user.id,
      username: req.user.username,
      action: 'candidate_restored',
      targetType: 'user',
      targetId: emp.id,
      module: 'candidates',
      detail: { name: emp.name, email: emp.email },
      req,
    });
    res.json({ restored: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/employees/:id/permanent', (req, res) => {
  const { users } = require('../repositories');
  const emp = users.findEmployeeWithProfile(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  // Permanent hard delete — only for already soft-deleted or with ?force=1
  const force = req.query.force === '1';
  if (!emp.is_deleted && !force) {
    return res.status(400).json({ error: 'Candidate must be soft-deleted first. Delete again or use ?force=1 for permanent.' });
  }
  try {
    db.exec('BEGIN');
    const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
    if (sc) {
      db.prepare('DELETE FROM scores WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM scorecard_updates WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM scores WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM scoring_snapshots WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM deal_factor_scores WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM parameter_evidence WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM must_have_results WHERE scorecard_id = ?').run(sc.id);
      db.prepare('DELETE FROM candidate_decisions WHERE candidate_id = ?').run(emp.id);
      db.prepare('DELETE FROM candidate_emails WHERE candidate_id = ?').run(emp.id);
      db.prepare('DELETE FROM approval_workflows WHERE candidate_id = ?').run(emp.id);
      db.prepare('DELETE FROM scorecards WHERE id = ?').run(sc.id);
    }
    db.prepare('DELETE FROM numerology_profiles WHERE employee_id = ?').run(emp.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(emp.id);
    db.exec('COMMIT');
    require('../audit').logAudit({
      performedBy: req.user.id,
      username: req.user.username,
      action: 'candidate_permanently_deleted',
      targetType: 'user',
      targetId: emp.id,
      module: 'candidates',
      detail: { name: emp.name, email: emp.email },
      req,
    });
    res.json({ deleted: true, permanent: true });
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
  const jd = db.prepare('SELECT id, title FROM job_descriptions WHERE id = ?').get(req.params.id);
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
  require('../audit').logAudit({
    performedBy: req.user.id,
    username: req.user.username,
    action: 'jd_deleted',
    targetType: 'job_description',
    targetId: jd.id,
    module: 'content',
    detail: { title: jd.title },
    req,
  });
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
    const hasPasted = typeof req.body.description_text === 'string' && String(req.body.description_text).length > 0;
    let description_text = String(req.body.description_text || '').trim();
    let company_id = req.body.company_id ? Number(req.body.company_id) : null;
    let file_path = null;

    if (req.file) {
      const text = await extractText(req.file.buffer, req.file.originalname);
      if (!description_text) description_text = text;
      file_path = saveBuffer(req.file.buffer, req.file.originalname, 'jds');
      if (!title) title = path.parse(req.file.originalname).name;
    }

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!req.file && !hasPasted) return res.status(400).json({ error: 'title and description_text (or file) are required' });

    const resolved = await jdValidation.validateAndResolveJD({ descriptionText: description_text, title, client }, { db });
    if (resolved.status === 'invalid') return res.status(400).json({ error: resolved.error });
    if (resolved.status === 'duplicate') {
      return res.status(409).json({ duplicate: true, existingJdId: resolved.jd.id, message: jdValidation.ERROR_MESSAGES.duplicate });
    }

    const insert = jdValidation.insertJD(db, {
      title: title,
      client: client || null,
      company_id,
      description_text: resolved.text,
      file_path,
      hash: resolved.hash,
    });
    if (!insert.inserted) {
      return res.status(409).json({ duplicate: true, existingJdId: Number(insert.existing.id), message: jdValidation.ERROR_MESSAGES.duplicate });
    }
    syncJDKeywordsFromText(insert.id, resolved.text);
    const row = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(insert.id);
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
    const validation = jdValidation.validateJDText(description_text);
    if (!validation.valid) return res.status(400).json({ error: validation.message });
    const hash = jdValidation.hashJD(description_text);
    const clash = db.prepare('SELECT id, title FROM job_descriptions WHERE jd_hash = ? AND id != ?').get(hash, existing.id);
    if (clash) return res.status(409).json({ duplicate: true, existingJdId: clash.id, message: jdValidation.ERROR_MESSAGES.duplicate });
    const requirements = extractKeywords(description_text);
    db.prepare('UPDATE job_descriptions SET title=?, client=?, company_id=?, description_text=?, requirements=?, file_path=?, jd_hash=? WHERE id=?').run(title, client, company_id, description_text, JSON.stringify(requirements), file_path, hash, req.params.id);
    syncJDKeywordsFromText(req.params.id, description_text);
    const row = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/employees', uploadDoc.fields([{ name: 'resume', maxCount: 1 }, { name: 'jd_file', maxCount: 1 }]), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    let job_description_id = req.body.job_description_id ? Number(req.body.job_description_id) : null;
    const position = String(req.body.position || req.body.role || '').trim();
    const client = String(req.body.client || '').trim();
    const company_id = req.body.company_id ? Number(req.body.company_id) : null;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    const dob = String(req.body.date_of_birth || '').trim();
    // DOB is optional at creation — it can be filled in later from the Behavioral
    // Reflection date step. An empty value stores NULL (name-only preview until then).
    if (dob) {
      const m = /^\d{4}-\d{2}-\d{2}$/.exec(dob);
      const parts = m ? dob.split('-').map(Number) : null;
      const dt = parts ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
      const dobValid = dt !== null && dt.getFullYear() === parts[0] && dt.getMonth() === parts[1] - 1 && dt.getDate() === parts[2];
      if (!dobValid) return res.status(400).json({ error: 'Date of Birth must be a valid date (YYYY-MM-DD).' });
      if (dt > new Date()) return res.status(400).json({ error: 'Date of Birth cannot be in the future.' });
    }
    // No duplicate check: Add Candidate must always succeed, even when a candidate
    // with the same name/email is already on file. makeUsername() below already
    // de-duplicates the login (sreddy, sreddy1, ...) so each add gets its own row.

    const { makeUsername } = require('../database');
    let username = makeUsername(name);

    const resumeFile = req.files && req.files['resume'] ? req.files['resume'][0] : null;
    const jdFile = req.files && req.files['jd_file'] ? req.files['jd_file'][0] : null;

    if (jdFile) {
      const jdTitle = position || path.parse(jdFile.originalname).name;
      const jdClient = client || null;
      const resolved = await jdValidation.validateAndResolveJD({ buffer: jdFile.buffer, originalname: jdFile.originalname, title: jdTitle, client: jdClient }, { db });
      if (resolved.status === 'invalid') return res.status(400).json({ error: resolved.error });
      if (resolved.status === 'duplicate') {
        job_description_id = Number(resolved.jd.id);
      } else {
        const jdFilePath = saveBuffer(jdFile.buffer, jdFile.originalname, 'jds');
        const insert = jdValidation.insertJD(db, {
          title: jdTitle,
          client: jdClient,
          description_text: resolved.text,
          file_path: jdFilePath,
          hash: resolved.hash,
        });
        if (insert.inserted) {
          job_description_id = insert.id;
          syncJDKeywordsFromText(job_description_id, resolved.text);
        } else {
          job_description_id = Number(insert.existing.id);
        }
      }
    }

    let resume_file_path = null;
    let resume_text = null;
    let resumeWarning = null;
    if (resumeFile) {
      const resumeResult = await resumeValidation.validateResume(resumeFile.buffer, resumeFile.originalname);
      if (!resumeResult.valid) {
        resumeValidation.logRejection(resumeFile, resumeResult);
        return res.status(400).json({ error: resumeResult.message });
      }
      if (resumeResult.reason === 'no_text') {
        resumeValidation.logUnscored(resumeFile, resumeResult);
        resumeWarning = resumeResult.warning;
      }
      resume_text = await extractText(resumeFile.buffer, resumeFile.originalname);
      resume_file_path = saveBuffer(resumeFile.buffer, resumeFile.originalname, 'resumes');
    }

    let newOrgId = null;
    try { newOrgId = (db.prepare("SELECT id FROM organizations WHERE slug = 'humsee'").get() || {}).id; } catch (e) {}

    const insert = db.prepare('INSERT INTO users (username, password, role, name, email, date_of_birth, job_description_id, resume_file_path, resume_text, company_id, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = insert.run(username, bcrypt.hashSync(require('../security').defaultEmployeePassword(), 10), 'employee', name, email, dob || null, job_description_id, resume_file_path, resume_text, company_id, newOrgId);
    // Keyed on the inserted id — never on email, which can now legitimately repeat.
    const user = db.prepare('SELECT id, name, email, date_of_birth, job_description_id, capability_match_pct FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
    require('../audit').logAudit({ performedBy: req.user.id, action: 'candidate_created', targetType: 'user', targetId: user.id, detail: { email, name }, req });

    let autoScores = null;
    if (resume_text && job_description_id) {
      const jd = db.prepare('SELECT description_text, title FROM job_descriptions WHERE id = ?').get(job_description_id);
      if (jd) {
        const { pct, matched, missing, categories } = matchResumeToJD(jd.description_text, resume_text, { jdKeywords: getActiveJDKeywords(job_description_id) });
        db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(pct, JSON.stringify({ matched, missing, categories }), user.id);
        user.capability_match_pct = pct;
        const numerologyProfile = db.prepare('SELECT life_path_number FROM numerology_profiles WHERE employee_id = ? AND dimension = ?').get(user.id, 'candidate');
        const lifePath = numerologyProfile ? numerologyProfile.life_path_number : (dob ? numer.lifePathNumber(dob) : null);
        autoScores = autoRateSopParameters({ jdText: jd.description_text, resumeText: resume_text, jobTitle: position || jd.title });
        const targetClient = client || jd.client || null;
        const targetPosition = position || jd.title || null;
        const existingSc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(user.id);
        let scorecardId;
        if (existingSc) {
          db.prepare('UPDATE scorecards SET applicant_name = ?, email = ?, client = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, email, targetClient, targetPosition, existingSc.id);
          scorecardId = existingSc.id;
        } else {
          const info = db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (?, ?, ?, ?, ?)').run(user.id, name, email, targetClient, targetPosition);
          scorecardId = Number(info.lastInsertRowid);
        }
        const insertScore = db.prepare('INSERT INTO scores (scorecard_id, parameter_id, score, status) VALUES (?, ?, ?, ?)');
        autoScores.forEach(s => insertScore.run(scorecardId, s.parameter_id, s.score, s.status));
        const insertEvidence = db.prepare('INSERT INTO parameter_evidence (scorecard_id, parameter_id, score, confidence, evidence_items, source, reason, jd_match_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        autoScores.forEach(s => insertEvidence.run(scorecardId, s.parameter_id, s.score, s.confidence == null ? 0 : s.confidence, JSON.stringify(evidenceWithGaps(s)), 'auto', s.reason || null, pct));
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

    if (resumeWarning) user.resume_warning = resumeWarning;
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
    const resumeResult = await resumeValidation.validateResume(req.file.buffer, req.file.originalname);
    if (!resumeResult.valid) {
      resumeValidation.logRejection(req.file, resumeResult);
      return res.status(400).json({ error: resumeResult.message });
    }
    let resumeWarning = null;
    if (resumeResult.reason === 'no_text') {
      resumeValidation.logUnscored(req.file, resumeResult);
      resumeWarning = resumeResult.warning;
    }
    const job_description_id = req.body.job_description_id ? Number(req.body.job_description_id) : null;
    const resume_text = await extractText(req.file.buffer, req.file.originalname);
    const resume_file_path = saveBuffer(req.file.buffer, req.file.originalname, 'resumes');
    if (job_description_id) {
      db.prepare('UPDATE users SET resume_file_path = ?, resume_text = ?, job_description_id = ? WHERE id = ?').run(resume_file_path, resume_text, job_description_id, emp.id);
    } else {
      db.prepare('UPDATE users SET resume_file_path = ?, resume_text = ? WHERE id = ?').run(resume_file_path, resume_text, emp.id);
    }
    const result = runCapabilityMatch(emp.id);
    const autoScores = job_description_id ? sopAutoRateIfMissing(emp.id) : null;
    const user = db.prepare('SELECT id, capability_match_pct, capability_match_detail FROM users WHERE id = ?').get(emp.id);
    let detail = null;
    try { detail = user.capability_match_detail ? JSON.parse(user.capability_match_detail) : null; } catch (e) {}
    require('../audit').logAudit({
      performedBy: req.user.id,
      username: req.user.username,
      action: 'resume_uploaded',
      targetType: 'user',
      targetId: emp.id,
      module: 'candidates',
      detail: { file: req.file.originalname },
      req,
    });
    res.json({ resume_file_path, capability_match_pct: user.capability_match_pct, capability_match_detail: detail, matched: result ? result.matched : [], missing: result ? result.missing : [], auto_rated: !!autoScores, resume_warning: resumeWarning });
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
    // Mirror the same must-have analysis into must_have_results so the table
    // (GET /must-have, auto-rate) and the live gate read identical data.
    if (match.mustHave && Array.isArray(match.mustHave.results) && match.mustHave.results.length) {
      try {
        const scRow = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
        if (scRow) {
          const { storeMustHaveResults } = require('../mustHaveGate');
          db.exec('BEGIN');
          db.prepare('DELETE FROM must_have_results WHERE scorecard_id = ?').run(scRow.id);
          storeMustHaveResults(db, scRow.id, emp.job_description_id, match.mustHave);
          db.exec('COMMIT');
        }
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (ignored) {}
      }
    }
    const autoScores = sopAutoRateIfMissing(emp.id);
    res.json({ ...body, auto_rated: !!autoScores });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/employees/:id/integrity-check', (req, res) => {
  try {
    const emp = db.prepare('SELECT id, name, resume_text, job_description_id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    if (!emp.resume_text || !emp.resume_text.trim()) {
      return res.json({ integrityStatus: 'No resume text to analyze', detectedFlags: [] });
    }
    const result = analyzeResume(emp.resume_text);
    res.json(result);
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
    let resumeResult = null;
    if (req.file) {
      resumeResult = await resumeValidation.validateResume(req.file.buffer, req.file.originalname);
      if (!resumeResult.valid) {
        resumeValidation.logRejection(req.file, resumeResult);
        return res.status(400).json({ error: resumeResult.message });
      }
      if (resumeResult.reason === 'no_text') resumeValidation.logUnscored(req.file, resumeResult);
      resumeText = await extractText(req.file.buffer, req.file.originalname);
      const fp = saveBuffer(req.file.buffer, req.file.originalname, 'resumes');
      db.prepare('UPDATE users SET resume_text = ?, resume_file_path = ? WHERE id = ?').run(resumeText, fp, emp.id);
    }
    if (jobDescId && jobDescId !== emp.job_description_id) {
      db.prepare('UPDATE users SET job_description_id = ? WHERE id = ?').run(jobDescId, emp.id);
    }
    if (!resumeText || !jobDescId) {
      const why = (resumeResult && resumeResult.reason === 'no_text' && !resumeText)
        ? resumeResult.warning
        : 'Need both JD and resume to auto-rate. Upload resume and select a JD.';
      return res.status(400).json({ error: why });
    }
    const jd = db.prepare('SELECT description_text, title FROM job_descriptions WHERE id = ?').get(jobDescId);
    if (!jd) return res.status(404).json({ error: 'Job description not found' });
    const { pct, matched, missing, categories, requirements, mustHave } = matchResumeToJD(jd.description_text, resumeText, { jdKeywords: getActiveJDKeywords(jobDescId) });
    db.prepare('UPDATE users SET capability_match_pct = ?, capability_match_detail = ? WHERE id = ?').run(pct, JSON.stringify({ matched, missing, categories, requirements, mustHave }), emp.id);
    const profile = db.prepare('SELECT life_path_number FROM numerology_profiles WHERE employee_id = ? AND dimension = ?').get(emp.id, 'candidate');
    const lifePath = profile ? profile.life_path_number : numer.nameNumber(emp.name);
    const enhanced = autoRateEnhanced({ jdText: jd.description_text, resumeText, candidateName: emp.name, jobTitle: position || jd.title, lifePath, jdId: jobDescId, db });
    const sopScores = autoRateSopParameters({ jdText: jd.description_text, resumeText, jobTitle: position || jd.title });
    const scores = sopScores.length > 0 ? sopScores : enhanced.paramScores;
    const { storeRequirements } = require('../jdAnalyzer');
    const { storeMustHaveResults } = require('../mustHaveGate');
    db.exec('BEGIN');
    const existingSc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
    let scorecardId;
    if (existingSc) {
      db.prepare("DELETE FROM scores WHERE scorecard_id = ? AND parameter_id IN (SELECT id FROM parameters WHERE status = 'active' AND grp != 'DEAL')").run(existingSc.id);
      db.prepare("DELETE FROM parameter_evidence WHERE scorecard_id = ? AND parameter_id IN (SELECT id FROM parameters WHERE status = 'active' AND grp != 'DEAL')").run(existingSc.id);
      db.prepare('DELETE FROM must_have_results WHERE scorecard_id = ?').run(existingSc.id);
      scorecardId = existingSc.id;
      if (position) db.prepare('UPDATE scorecards SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(position, scorecardId);
    } else {
      const info = db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (?, ?, ?, ?, ?)').run(emp.id, emp.name, '', null, position || jd.title);
      scorecardId = Number(info.lastInsertRowid);
    }
    const insertScore = db.prepare('INSERT INTO scores (scorecard_id, parameter_id, score, status) VALUES (?, ?, ?, ?)');
    scores.forEach(s => insertScore.run(scorecardId, s.parameter_id, s.score, s.status || 'active'));
    const insertEvidence = db.prepare('INSERT INTO parameter_evidence (scorecard_id, parameter_id, score, confidence, evidence_items, source, reason, jd_match_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    scores.forEach(s => {
      insertEvidence.run(scorecardId, s.parameter_id, s.score, s.confidence == null ? 0 : s.confidence, JSON.stringify(evidenceWithGaps(s)), 'auto', s.reason || (s.detail ? 'auto-rated: ' + (typeof s.detail === 'string' ? s.detail : '') : null) || null, pct);
    });
    storeRequirements(db, jobDescId, enhanced.jdAnalysis ? enhanced.evidenceResults.map(e => ({ text: e.requirement, term: e.term, category: e.category, importance: e.importance })) : []);
    storeMustHaveResults(db, scorecardId, jobDescId, enhanced.mustHaveCheck);
    db.prepare('INSERT INTO scorecard_updates (scorecard_id, source) VALUES (?, ?)').run(scorecardId, 'numerology_suggested');
    db.exec('COMMIT');
    const sc = loadScorecard(emp.id);
    res.json({ capability_match_pct: pct, matched, missing, requirements: requirements || [], scores: sc.scores, scorecard: sc, auto_rated: true, must_have: mustHave || enhanced.mustHaveCheck, overall_confidence: enhanced.overallConfidence });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    res.status(400).json({ error: e.message });
  }
});

router.get('/employees/:id/scorecard', (req, res) => {
  const emp = db.prepare('SELECT id, name, email, company_id, organization_id FROM users WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (req.user && req.user.organization_id != null && emp.organization_id != null && Number(req.user.organization_id) !== Number(emp.organization_id)) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const sc = loadScorecard(req.params.id);
  if (sc && sc.assigned_recruiter_id != null && Number(sc.assigned_recruiter_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'This scorecard is assigned to another recruiter.' });
  }
  if (!sc) return res.json({
    scorecard: { company_id: emp.company_id || null },
    scores: [],
    decision: null,
    deal_factors: decisionService.dealFactorsFor(null),
  });

  res.json({
    scorecard: { ...sc, company_id: emp.company_id || null },
    scores: sc.scores,
    decision: decisionService.computeAndPersistDecision(req.params.id),
    deal_factors: decisionService.dealFactorsFor(sc.id),
  });
});

router.post('/employees/:id/scorecard', (req, res) => {
  const { users, scorecards } = require('../repositories');
  const emp = users.findById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (req.user && req.user.organization_id != null && emp.organization_id != null && Number(req.user.organization_id) !== Number(emp.organization_id)) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const existing = scorecards.findForScorecardWrite(emp.id);
  if (existing && existing.assigned_recruiter_id != null && Number(existing.assigned_recruiter_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'This scorecard is assigned to another recruiter.' });
  }

  const {
    applicant_name, email, client, position,
    jd_shared, jd_shared_date, remarks, scores, deal_factors, source, company_id,
    assigned_recruiter_id,
  } = req.body;

  if (!applicant_name) return res.status(400).json({ error: 'applicant_name is required' });
  const updateSource = source === 'numerology_suggested' ? 'numerology_suggested' : 'manual';

  try {
    db.exec('BEGIN');

    let scorecardId;
    if (existing) {
      // Reassignment/clear only by the current owner (enforced above) or when
      // the scorecard is unassigned. Null body field clears; absent body field
      // keeps the current assignment untouched.
      let newAssignee = existing.assigned_recruiter_id;
      if (Object.prototype.hasOwnProperty.call(req.body, 'assigned_recruiter_id')) {
        newAssignee = assigned_recruiter_id == null ? null : Number(assigned_recruiter_id);
      }
      db.prepare(`
        UPDATE scorecards SET applicant_name = ?, email = ?, client = ?, position = ?,
               jd_shared = ?, jd_shared_date = ?, remarks = ?, assigned_recruiter_id = ?,
               updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(applicant_name, email || null, client || null, position || null,
             jd_shared ? 1 : 0, jd_shared_date || null, remarks || null,
             newAssignee, existing.id);
      scorecardId = existing.id;
    } else {
      const info = db.prepare(`
        INSERT INTO scorecards (employee_id, applicant_name, email, client, position, jd_shared, jd_shared_date, remarks, assigned_recruiter_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(emp.id, applicant_name, email || null, client || null, position || null,
             jd_shared ? 1 : 0, jd_shared_date || null, remarks || null,
             assigned_recruiter_id != null ? Number(assigned_recruiter_id) : req.user.id);
      scorecardId = Number(info.lastInsertRowid);
    }

    // Replace only SOP-active parameter rows, leaving legacy (read-only) history intact.
    db.prepare(`
      DELETE FROM scores WHERE scorecard_id = ?
        AND parameter_id IN (SELECT id FROM parameters WHERE status = 'active')
    `).run(scorecardId);

    const cleanScores = (Array.isArray(scores) ? scores : []).map(s => {
      let score = s.score == null ? null : Number(s.score);
      if (score != null && !Number.isFinite(score)) score = null;
      if (score != null) score = Math.max(0, Math.min(100, Math.round(score)));
      const status = (s.status === 'na' || s.status === 'not_scored') ? s.status : 'active';
      const note = (s.note == null || s.note === '') ? null : String(s.note).slice(0, 2000);
      return { parameter_id: Number(s.parameter_id), score, status, note };
    });
    for (const s of cleanScores) {
      if (!s.parameter_id || (s.score == null && s.status === 'active')) {
        throw new Error(`Parameter ${s.parameter_id} is missing a score (0-100) or an N/A status`);
      }
    }
    const insertScore = db.prepare(
      'INSERT INTO scores (scorecard_id, parameter_id, score, status, note) VALUES (?, ?, ?, ?, ?)'
    );
    cleanScores.forEach(s => insertScore.run(scorecardId, s.parameter_id, s.score, s.status, s.note));

    // deal_factors present as an array → replace (explicit clear = []).
    // Absent (undefined) → leave existing rows untouched, so partial payloads
    // can never wipe already-rated DEAL factors.
    if (Array.isArray(deal_factors)) {
      db.prepare('DELETE FROM deal_factor_scores WHERE scorecard_id = ?').run(scorecardId);
      if (deal_factors.length > 0) {
        const upsertFactor = db.prepare(`
          INSERT INTO deal_factor_scores (scorecard_id, factor_key, score, note)
          VALUES (?, ?, ?, ?)
        `);
        deal_factors.forEach(f => {
          const fscore = f.score == null ? null : Math.max(0, Math.min(100, Math.round(Number(f.score))));
          upsertFactor.run(scorecardId, f.factor_key, fscore, f.note || null);
        });
      }
    }

    db.prepare('INSERT INTO scorecard_updates (scorecard_id, source) VALUES (?, ?)').run(scorecardId, updateSource);

    if (company_id != null) {
      db.prepare('UPDATE users SET company_id = ? WHERE id = ?').run(Number(company_id), emp.id);
    } else if (company_id === null || company_id === '') {
      db.prepare('UPDATE users SET company_id = NULL WHERE id = ?').run(emp.id);
    }

    db.exec('COMMIT');

    const scorePreview = (Array.isArray(cleanScores) ? cleanScores : []).filter(s => s.score != null).length;
    require('../audit').logAudit({ performedBy: req.user.id, action: 'scorecard_updated', targetType: 'scorecard', targetId: scorecardId, detail: { employeeId: emp.id, scores: scorePreview }, req });

    const sc = loadScorecard(emp.id);
    const decision = decisionService.computeAndPersistDecision(emp.id);
    res.json({
      scorecard: sc,
      scores: sc.scores,
      decision,
      deal_factors: decisionService.dealFactorsFor(scorecardId),
    });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    const isCheck = String(e.message).includes('CHECK constraint');
    const msg = isCheck ? 'Scores must be 0-100 — every active parameter needs a score or an N/A status before saving.' : e.message;
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

  // Headers vary between sheets ("Full Name", "Role", "Company", ...). Match
  // keys case-insensitively instead of requiring exact Name/Email/Client/Position.
  const headerKeyMap = {};
  if (rows.length) {
    Object.keys(rows[0]).forEach(k => { headerKeyMap[String(k).trim().toLowerCase()] = k; });
  }
  const pick = (row, aliases) => {
    for (const a of aliases) {
      const k = headerKeyMap[a];
      if (k != null && String(row[k] == null ? '' : row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
  };

  // If the sheet has a title row above the real header row, sheet_to_json would
  // return junk keys and every row would be skipped. Fall back to scanning the
  // raw grid for the header row.
  let parsedRows = rows;
  if (!rows.length || !rows.some(r => pick(r, ['name', 'candidate name', 'full name', 'applicant name', 'candidate']))) {
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    const nameAliases = ['name', 'candidate name', 'full name', 'applicant name', 'candidate', 'employee name'];
    let headerIdx = -1;
    for (let i = 0; i < Math.min(grid.length, 25); i++) {
      const cells = (grid[i] || []).map(c => String(c).trim().toLowerCase());
      if (cells.some(c => nameAliases.includes(c))) { headerIdx = i; break; }
    }
    if (headerIdx >= 0) {
      const headers = (grid[headerIdx] || []).map(h => String(h).trim());
      parsedRows = grid.slice(headerIdx + 1).map(cells => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = cells[i] == null ? '' : cells[i]; });
        return obj;
      }).filter(obj => Object.values(obj).some(v => String(v).trim() !== ''));
      Object.keys(headerKeyMap).forEach(k => delete headerKeyMap[k]);
      if (parsedRows.length) Object.keys(parsedRows[0]).forEach(k => { headerKeyMap[String(k).trim().toLowerCase()] = k; });
    }
  }

  const getAllUsernames = () => db.prepare('SELECT username FROM users').all().map(u => u.username);
  // Scope to employees and skip soft-deleted rows: Add Candidate no longer
  // de-duplicates, so several rows can share an email. Without this filter a
  // hidden (deleted) row would win the lookup and the import would update a
  // candidate the recruiter cannot see instead of creating a visible one.
  const findUser = db.prepare(
    "SELECT id, name FROM users WHERE email = ? AND role = 'employee' AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY id DESC LIMIT 1"
  );
  // organization_id MUST be set — GET /employees scopes by it, so a NULL org
  // makes the imported candidate invisible in the Scores list (silent failure).
  let importOrgId = (req.user && req.user.organization_id != null) ? Number(req.user.organization_id) : null;
  if (importOrgId == null) {
    try { importOrgId = (db.prepare("SELECT id FROM organizations WHERE slug = 'humsee'").get() || {}).id; } catch (e) {}
  }
  const insertUser = db.prepare(
    'INSERT INTO users (username, password, role, name, email, organization_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const claimOrg = db.prepare('UPDATE users SET organization_id = COALESCE(organization_id, ?) WHERE id = ?');

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
  let skipped = 0;
  const insertScorecard = db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (?, ?, ?, ?, ?)');

  for (const row of parsedRows) {
    const name     = pick(row, ['name', 'candidate name', 'full name', 'applicant name', 'candidate', 'employee name']);
    const email    = pick(row, ['email', 'email id', 'email address', 'mail', 'e-mail']);
    const client   = pick(row, ['client', 'client name', 'company', 'account', 'customer']);
    const position = pick(row, ['position', 'role', 'title', 'designation', 'job title', 'job']);

    if (!name) { skipped++; continue; }

    const existing = email ? findUser.get(email) : null;

    if (existing) {
      claimOrg.run(importOrgId, existing.id);
      if (client || position) {
        const hasSc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(existing.id);
        if (hasSc) {
          db.prepare(`UPDATE scorecards SET client = ?, position = ? WHERE employee_id = ?`)
            .run(client || null, position || null, existing.id);
        } else {
          insertScorecard.run(existing.id, name, email || null, client || null, position || null);
        }
      }
      results.push({ name, email, status: 'updated' });
      updated++;
    } else {
      const username = uniqueEmail(email);
      if (importOrgId != null) insertUser.run(username, bcrypt.hashSync(require('../security').defaultEmployeePassword(), 10), 'employee', name, email, importOrgId);
      else insertUser.run(username, bcrypt.hashSync(require('../security').defaultEmployeePassword(), 10), 'employee', name, email);
      const newUser = email ? findUser.get(email) : db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (newUser && (client || position)) insertScorecard.run(newUser.id, name, email || null, client || null, position || null);
      created++;
      results.push({ name, email, status: 'created' });
    }
  }

  if (created === 0 && updated === 0) {
    return res.status(400).json({
      error: `No candidate rows found. Expected a header row with a Name column (plus optional Email, Client, Position). ${skipped} row(s) had no name.`,
      skipped,
      headers: parsedRows.length ? Object.keys(parsedRows[0]) : [],
    });
  }

  const message = `${updated} record(s) updated. ${created} new employee(s) created from Excel.` + (skipped ? ` ${skipped} row(s) skipped (no Name).` : '');
  res.json({
    results,
    updated,
    created,
    skipped,
    message,
  });
  require('../audit').logAudit({
    performedBy: req.user.id,
    username: req.user.username,
    action: 'excel_import',
    targetType: 'bulk',
    module: 'candidates',
    detail: { created, updated, skipped, file: req.file.originalname },
    req,
  });
});

router.get('/employees/:id/evidence', (req, res) => {
  const emp = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
  if (!sc) return res.json({ evidence: [] });
  const evidence = db.prepare('SELECT * FROM parameter_evidence WHERE scorecard_id = ? ORDER BY parameter_id').all(sc.id);
  res.json({ evidence: evidence.map(e => ({ ...e, evidence_items: JSON.parse(e.evidence_items || '[]') })) });
});

router.get('/employees/:id/must-have', (req, res) => {
  const emp = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(emp.id);
  if (!sc) return res.json({ results: [], passed: true });
  const results = db.prepare('SELECT * FROM must_have_results WHERE scorecard_id = ? ORDER BY id').all(sc.id);
  const passed = results.every(r => r.met);
  const criticalPassed = results.filter(r => r.severity === 'critical').every(r => r.met);
  res.json({ results: results.map(r => ({ ...r, evidence: JSON.parse(r.evidence || '[]') })), passed, criticalPassed });
});

router.get('/employees/filtered', (req, res) => {
  const { sort, order, jd_id, score_min, score_max, skill, experience_min, experience_max, evaluated } = req.query;
  let query = `SELECT u.id, u.name AS applicant_name, u.email, u.job_description_id, u.capability_match_pct,
               u.is_favorite, u.is_archived, u.date_of_birth,
               sc.id AS scorecard_id, sc.client, sc.position
               FROM users u LEFT JOIN scorecards sc ON sc.employee_id = u.id
               WHERE u.role = 'employee'`;
  const params = [];
  if (jd_id) { query += ' AND u.job_description_id = ?'; params.push(Number(jd_id)); }
  if (evaluated === 'yes') { query += ' AND sc.id IS NOT NULL'; }
  else if (evaluated === 'no') { query += ' AND sc.id IS NULL'; }
  if (score_min != null || score_max != null) {
    query += ' AND u.id IN (SELECT employee_id FROM scorecards sc2 JOIN scores s ON s.scorecard_id = sc2.id GROUP BY sc2.employee_id HAVING 1=1';
    if (score_min != null) { query += ' AND ROUND(CAST(SUM(CAST(s.score AS FLOAT)/5 * (SELECT weightage FROM parameters WHERE id=s.parameter_id)) AS FLOAT) / (SELECT SUM(weightage) FROM parameters) * 100) >= ?'; params.push(Number(score_min)); }
    if (score_max != null) { query += ' AND ROUND(CAST(SUM(CAST(s.score AS FLOAT)/5 * (SELECT weightage FROM parameters WHERE id=s.parameter_id)) AS FLOAT) / (SELECT SUM(weightage) FROM parameters) * 100) <= ?'; params.push(Number(score_max)); }
    query += ')';
  }
  const sortCol = { overallScore: 'u.capability_match_pct', name: 'u.name', jdMatch: 'u.capability_match_pct' }[sort] || 'u.id';
  const sortDir = order === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortCol} ${sortDir}`;
  const rows = db.prepare(query).all(...params);
  const out = rows.map(r => {
    const sc = r.scorecard_id ? { id: r.scorecard_id, client: r.client, position: r.position } : null;
    const scores = sc ? db.prepare('SELECT s.score, p.weightage FROM scores s JOIN parameters p ON p.id = s.parameter_id WHERE s.scorecard_id = ?').all(sc.id) : [];
    const pct = scores.length ? weightedPct(scores) : null;
    return { ...r, weighted_pct: pct, scorecard: sc };
  });
  res.json(out);
});

router.get('/company-profiles', (req, res) => {
  const profiles = db.prepare('SELECT * FROM company_profiles ORDER BY id').all();
  res.json(profiles);
});

router.post('/company-profiles', (req, res) => {
  const { name, industry, description, founded_year, headquarters, core_values, technology_stack, required_competencies, preferred_competencies, work_environment } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name is required' });
  const info = db.prepare('INSERT INTO company_profiles (name, industry, description, founded_year, headquarters, core_values, technology_stack, required_competencies, preferred_competencies, work_environment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, industry || null, description || null, founded_year || null, headquarters || null, core_values || null, technology_stack || null, required_competencies || null, preferred_competencies || null, work_environment || null);
  const profile = db.prepare('SELECT * FROM company_profiles WHERE id = ?').get(Number(info.lastInsertRowid));
  res.json(profile);
});

router.put('/company-profiles/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM company_profiles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company profile not found' });
  const { name, industry, description, founded_year, headquarters, core_values, technology_stack, required_competencies, preferred_competencies, work_environment } = req.body;
  db.prepare('UPDATE company_profiles SET name=?, industry=?, description=?, founded_year=?, headquarters=?, core_values=?, technology_stack=?, required_competencies=?, preferred_competencies=?, work_environment=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, industry || null, description || null, founded_year || null, headquarters || null, core_values || null, technology_stack || null, required_competencies || null, preferred_competencies || null, work_environment || null, req.params.id);
  const profile = db.prepare('SELECT * FROM company_profiles WHERE id = ?').get(req.params.id);
  res.json(profile);
});

router.delete('/company-profiles/:id', (req, res) => {
  const existing = db.prepare('SELECT id, name FROM company_profiles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Company profile not found' });
  db.prepare('DELETE FROM company_profiles WHERE id = ?').run(req.params.id);
  require('../audit').logAudit({
    performedBy: req.user.id,
    username: req.user.username,
    action: 'company_profile_deleted',
    targetType: 'company_profile',
    targetId: existing.id,
    module: 'content',
    detail: { name: existing.name },
    req,
  });
  res.json({ deleted: true });
});

router.get('/jd-weights/:jdId', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.jdId);
  if (!jd) return res.status(404).json({ error: 'JD not found' });
  const overrides = db.prepare('SELECT jdw.parameter_id, jdw.weightage, p.name FROM jd_weight_overrides jdw JOIN parameters p ON p.id = jdw.parameter_id WHERE jdw.jd_id = ?').all(req.params.jdId);
  const defaults = db.prepare('SELECT id AS parameter_id, weightage, name FROM parameters ORDER BY id').all();
  res.json({ overrides, defaults });
});

router.put('/jd-weights/:jdId', (req, res) => {
  const jd = db.prepare('SELECT id FROM job_descriptions WHERE id = ?').get(req.params.jdId);
  if (!jd) return res.status(404).json({ error: 'JD not found' });
  const { weights } = req.body;
  if (!weights || !Array.isArray(weights)) return res.status(400).json({ error: 'weights array required' });
  db.prepare('DELETE FROM jd_weight_overrides WHERE jd_id = ?').run(req.params.jdId);
  const insert = db.prepare('INSERT INTO jd_weight_overrides (jd_id, parameter_id, weightage) VALUES (?, ?, ?)');
  for (const w of weights) {
    if (w.parameter_id && w.weightage != null) insert.run(req.params.jdId, w.parameter_id, w.weightage);
  }
  res.json({ updated: true });
});

// Audit log (admin-only). Latest first, optionally filtered by action.
router.get('/audit-logs', (req, res) => {
  const action = String(req.query.action || '').trim();
  const { auditLogs } = require('../repositories');
  const rows = action
    ? db.prepare(`
        SELECT l.id, l.performed_by, l.username, u.name AS performed_by_name, l.action, l.target_type,
               l.target_id, l.module, l.detail, l.ip, l.created_at
        FROM audit_logs l LEFT JOIN users u ON u.id = l.performed_by
        WHERE l.action = ? ORDER BY l.id DESC LIMIT 500
      `).all(action)
    : auditLogs.recent(500);
  const cleaned = rows.map(r => {
    let detail = r.detail;
    if (detail && typeof detail === 'string') {
      try { detail = JSON.parse(detail); } catch (e) { /* keep raw */ }
    }
    return { ...r, detail: detail || null };
  });
  res.json({ logs: cleaned });
});

// Catch multer errors (file type rejected, too large) and return 400
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 5MB for Excel, 10MB for documents).' });
  }
  if (err && err.message && (err.message.includes('Only PDF') || err.message.includes('Only .xlsx') || err.message.includes('10MB') || err.message.includes('5MB') || err.code === 'LIMIT_FILE_SIZE' || err.message.includes('Unexpected field'))) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
