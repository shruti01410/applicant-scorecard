// Thin data-access layer. Routes call repositories; repositories own SQL for
// core entities so a future PostgreSQL swap only touches this folder + db driver.
const db = require('../database');

const users = {
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  },
  findByEmail(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  },
  findEmployee(id) {
    return db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'employee');
  },
  findEmployeeWithProfile(id) {
    return db.prepare('SELECT id, name, email FROM users WHERE id = ? AND role = ?').get(id, 'employee');
  },
  findEmployeeWithDecisionFields(id) {
    return db.prepare('SELECT id, name, email, job_description_id, resume_text, capability_match_detail FROM users WHERE id = ? AND role = ?').get(id, 'employee');
  },
  listEmployees({ search = '', archived } = {}) {
    const params = [];
    let where = "WHERE u.role = 'employee'";
    if (archived === true) where += ' AND u.is_archived = 1';
    if (archived === false) where += ' AND (u.is_archived = 0 OR u.is_archived IS NULL)';
    if (search) {
      where += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    return db.prepare(`
      SELECT u.id, u.name, u.email, u.organization_id, u.is_archived, u.created_at
      FROM users u ${where}
      ORDER BY u.is_favorite DESC, u.name
    `).all(...params);
  },
  countByRole(role) {
    const row = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get(role);
    return row ? row.c : 0;
  },
};

const scorecards = {
  findByEmployee(employeeId) {
    return db.prepare('SELECT * FROM scorecards WHERE employee_id = ?').get(employeeId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM scorecards WHERE id = ?').get(id);
  },
  findForScorecardWrite(employeeId) {
    return db.prepare('SELECT id, assigned_recruiter_id FROM scorecards WHERE employee_id = ?').get(employeeId);
  },
};

const jobDescriptions = {
  findById(id) {
    return db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(id);
  },
  findSummary(id) {
    return db.prepare('SELECT id, title, client FROM job_descriptions WHERE id = ?').get(id);
  },
  findByIdOrHashExclude(id, hash) {
    return db.prepare('SELECT id, title FROM job_descriptions WHERE jd_hash = ? AND id != ?').get(hash, id);
  },
};

const auditLogs = {
  recent(limit = 50) {
    return db.prepare(`
      SELECT l.id, l.performed_by, l.username, u.name AS performed_by_name,
             l.action, l.target_type, l.target_id, l.module, l.detail, l.ip, l.created_at
      FROM audit_logs l
      LEFT JOIN users u ON u.id = COALESCE(l.performed_by, l.user_id)
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ?
    `).all(limit);
  },
  count() {
    const row = db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get();
    return row ? row.c : 0;
  },
};

module.exports = { users, scorecards, jobDescriptions, auditLogs };
