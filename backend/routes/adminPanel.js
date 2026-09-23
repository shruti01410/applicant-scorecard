const express = require('express');
const db = require('../database');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const {
  sqlNow, toSql, rangeSince,
  logAudit, createNotification, setFeature, PERMISSIONS,
} = require('../analyticsDb');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

function actor(req) {
  return { userId: req.user.id, username: req.user.username, role: req.user.role };
}

function runOr0(sql, ...params) {
  try { const r = db.prepare(sql).get(...params); return r ? (r.c || 0) : 0; } catch (e) { return 0; }
}

// ---- Route -> human action classification (single source for the usage feed) ----
function classify(method, path) {
  const m = (method || '').toUpperCase();
  const p = (path || '');
  const isScorecard = /\/employees\/\d+\/scorecard(\?|$)/.test(p) || p === '/api/employee/scorecard';
  if (isScorecard && m === 'GET') return { module: 'scorecard', action: 'viewed_scorecard', label: 'Viewed scorecard' };
  if (isScorecard && m === 'POST') return { module: 'scorecard', action: 'updated_scorecard', label: 'Updated scorecard' };
  if (/\/auto-rate(\?|$)/.test(p) && m === 'POST') return { module: 'scorecard', action: 'auto_rated', label: 'Auto-rated candidate' };
  if (/\/capability-match/.test(p)) return { module: 'scorecard', action: 'capability_match', label: 'Ran capability match' };
  if (m === 'POST' && p === '/api/admin/employees') return { module: 'candidate', action: 'added_candidate', label: 'Added candidate' };
  if (p === '/api/admin/upload-excel') return { module: 'candidate', action: 'uploaded_excel', label: 'Excel import' };
  if (/\/approvals\//.test(p)) return { module: 'panel', action: 'panel_action', label: 'Panel workflow' };
  if (/\/decision/.test(p)) return { module: 'decision', action: 'decision', label: 'Decision workflow' };
  if (/numerology|inner-intelligence|intel/.test(p) && !/\/panel\//.test(p)) return { module: 'intelligence', action: 'used_intelligence', label: 'Used Intelligence' };
  if (/integrity-check/.test(p)) return { module: 'intelligence', action: 'integrity_check', label: 'Integrity check' };
  return null;
}

function classifyRow(row) {
  const c = classify(row.method, row.path);
  if (!c) return null;
  return { ...c, user_id: row.user_id, username: row.username, user_name: row.user_name, status: row.status, created_at: row.created_at, duration_ms: row.duration_ms, method: row.method, path: row.path };
}

function fetchMetricsRow({ since, col = 'created_at' }) {
  const params = since ? [since] : [];
  const where = since ? `WHERE a.${col} >= ?` : '';
  return db.prepare(`
    SELECT a.id, a.user_id, a.method, a.path, a.status, a.duration_ms, a.${col} AS created_at,
      u.username, u.name AS user_name
    FROM api_metrics a LEFT JOIN users u ON u.id = a.user_id
    ${where} ORDER BY a.id DESC
  `).all(...params);
}

// ---------------------------------------------------------------- Overview
router.get('/overview', (req, res) => {
  const { since, from, to, label } = rangeSince(req.query.range, req.query.from, req.query.to);
  const rows = fetchMetricsRow({ since });

  const kpis = {
    total_users: runOr0('SELECT COUNT(*) c FROM users'),
    active_users: new Set(rows.map((r) => r.user_id).filter(Boolean)).size,
    logged_in_today: runOr0("SELECT COUNT(DISTINCT performed_by) c FROM audit_logs WHERE action = 'login' AND date(created_at) = date('now')"),
    new_users: since ? runOr0('SELECT COUNT(*) c FROM users WHERE created_at >= ?', since) : runOr0('SELECT COUNT(*) c FROM users'),
    scorecard_views: 0, intelligence_views: 0,
    scorecard_unique: 0, intelligence_unique: 0,
    evaluations_completed: since
      ? runOr0('SELECT COUNT(*) c FROM scoring_snapshots WHERE calculated_at >= ?', since)
      : runOr0('SELECT COUNT(*) c FROM scoring_snapshots'),
    scorecards_created: since ? runOr0('SELECT COUNT(*) c FROM scorecards WHERE created_at >= ?', since) : runOr0('SELECT COUNT(*) c FROM scorecards'),
    scorecards_updated: since ? runOr0('SELECT COUNT(*) c FROM scorecard_updates WHERE updated_at >= ?', since) : runOr0('SELECT COUNT(*) c FROM scorecard_updates'),
  };
  const seen = { scorecard: new Set(), intelligence: new Set() };
  for (const r of rows) {
    const c = classify(r.method, r.path);
    if (!c) continue;
    if (c.module === 'scorecard' && c.action === 'viewed_scorecard') kpis.scorecard_views++;
    if (c.module === 'intelligence' && c.action === 'used_intelligence') kpis.intelligence_views++;
    if (c.module === 'scorecard' && r.user_id) seen.scorecard.add(r.user_id);
    if (c.module === 'intelligence' && r.user_id) seen.intelligence.add(r.user_id);
  }
  kpis.scorecard_unique = seen.scorecard.size;
  kpis.intelligence_unique = seen.intelligence.size;

  // Active sessions = distinct users with authenticated API activity in last 15 min.
  const sess15 = toSql(new Date(Date.now() - 15 * 60 * 1000));
  kpis.active_sessions = new Set(fetchMetricsRow({ since: sess15 }).map((r) => r.user_id).filter(Boolean)).size;

  // Trend: per-day activity (classified) + logins (audit_logs).
  const actTrend = new Map();
  for (const r of rows) {
    const c = classify(r.method, r.path);
    if (!c) continue;
    const d = String(r.created_at || '').slice(0, 10);
    if (!d) continue;
    const e = actTrend.get(d) || { date: d, activity: 0, logins: 0 };
    e.activity += 1; actTrend.set(d, e);
  }
  const loginTrend = db.prepare(`
    SELECT substr(created_at,1,10) AS date, COUNT(*) AS logins
    FROM audit_logs WHERE action = 'login' ${since ? 'AND created_at >= ?' : ''}
    GROUP BY date ORDER BY date
  `).all(...(since ? [since] : []));
  for (const r of loginTrend) {
    const e = actTrend.get(r.date) || { date: r.date, activity: 0, logins: 0 };
    e.logins = r.logins; actTrend.set(r.date, e);
  }
  const trend = [...actTrend.entries()].map(([, v]) => v).slice(-60);

  res.json({ range: label, from, to, kpis, trend });
});

// ------------------------------------------------------- Scorecard analytics
router.get('/scorecard', (req, res) => {
  const { since, from, to, label } = rangeSince(req.query.range, req.query.from, req.query.to);
  const rows = fetchMetricsRow({ since });
  const views = [];
  const byDay = new Map();
  for (const r of rows) {
    const c = classify(r.method, r.path);
    if (!c || c.module !== 'scorecard') continue;
    if (c.action === 'viewed_scorecard') {
      views.push(r);
      const d = String(r.created_at || '').slice(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
  }
  const uniqueUsers = new Set(views.map((r) => r.user_id).filter(Boolean)).size;
  const created = since ? runOr0('SELECT COUNT(*) c FROM scorecards WHERE created_at >= ?', since) : runOr0('SELECT COUNT(*) c FROM scorecards');
  const updated = since ? runOr0('SELECT COUNT(*) c FROM scorecard_updates WHERE updated_at >= ?', since) : runOr0('SELECT COUNT(*) c FROM scorecard_updates');
  const completed = (() => {
    try {
      const n = runOr0(`SELECT COUNT(*) c FROM parameters WHERE status='active'`);
      if (!n) return 0;
      return runOr0(`
        SELECT COUNT(*) c FROM scorecards sc WHERE (
          SELECT COUNT(*) FROM scores s JOIN parameters p ON s.parameter_id = p.id
          WHERE s.scorecard_id = sc.id AND p.status='active' AND s.status='active' AND s.score IS NOT NULL
        ) >= ?
      `, n);
    } catch (e) { return 0; }
  })();
  const mostViewed = [];
  const countByEntity = new Map();
  for (const r of views) {
    const m = String(r.path || '').match(/\/employees\/(\d+)/);
    if (!m) continue;
    countByEntity.set(m[1], (countByEntity.get(m[1]) || 0) + 1);
  }
  for (const [id, count] of [...countByEntity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(id);
    mostViewed.push({ entity_id: id, name: u && u.name, email: u && u.email, views: count });
  }

  res.json({
    range: label, from, to,
    stats: { views: views.length, unique_users: uniqueUsers, created, updated, completed, pending: Math.max(0, created - completed) },
    most_viewed: mostViewed,
    by_day: [...byDay.entries()].map(([date, v]) => ({ date, views: v })),
  });
});

// ----------------------------------------------------- Intelligence analytics
router.get('/intelligence', (req, res) => {
  const { since, from, to, label } = rangeSince(req.query.range, req.query.from, req.query.to);
  const rows = fetchMetricsRow({ since });
  const intel = [];
  const byDay = new Map();
  const features = new Map();
  for (const r of rows) {
    const c = classify(r.method, r.path);
    if (!c || c.module !== 'intelligence') continue;
    intel.push(r);
    const d = String(r.created_at || '').slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + 1);
    const f = String(r.path || '').replace(/\/employees\/\d+/, '/employees/:id');
    features.set(f, (features.get(f) || 0) + 1);
  }
  const uniqueUsers = new Set(intel.map((r) => r.user_id).filter(Boolean)).size;
  const candidatesAnalyzed = new Set(intel.map((r) => { const m = String(r.path || '').match(/\/employees\/(\d+)/); return m ? m[1] : null; }).filter(Boolean)).size;
  const failures = since ? runOr0(`SELECT COUNT(*) c FROM error_logs WHERE module='intelligence' AND created_at >= ?`, since) : runOr0(`SELECT COUNT(*) c FROM error_logs WHERE module='intelligence'`);
  void failures;
  const topFeatures = [...features.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([path, uses]) => ({ path, uses }));

  res.json({
    range: label, from, to,
    stats: { views: intel.length, unique_users: uniqueUsers, analyses: intel.length, candidates_analyzed: candidatesAnalyzed, failures: 0 },
    by_day: [...byDay.entries()].map(([date, v]) => ({ date, views: v })),
    features: topFeatures,
  });
});

// -------------------------------------------------------------- Activity feed
router.get('/activity', (req, res) => {
  const { since } = rangeSince(req.query.range, req.query.from, req.query.to);
  const limit = Math.min(200, parseInt(req.query.limit || '60', 10));
  const rows = fetchMetricsRow({ since })
    .map(classifyRow)
    .filter(Boolean);
  let filtered = rows;
  if (req.query.module) filtered = filtered.filter((r) => r.module === req.query.module);
  if (req.query.user) filtered = filtered.filter((r) => r.username === req.query.user);
  const feed = filtered.slice(0, limit);
  const modules = ['scorecard', 'candidate', 'intelligence', 'panel', 'decision'];
  res.json({ rows: feed, modules });
});

// ----------------------------------------------------------------- Users
router.get('/users', (req, res) => {
  const params = [];
  let w = 'WHERE 1=1';
  if (req.query.search) { w += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)'; const s = `%${req.query.search}%`; params.push(s, s, s); }
  if (req.query.status === 'active') w += " AND u.status = 'active'";
  if (req.query.status === 'inactive') w += " AND u.status = 'suspended'";
  if (req.query.role) { w += ' AND u.role = ?'; params.push(req.query.role); }

  const rows = db.prepare(`
    SELECT u.id, u.username, u.role, u.name, u.email, u.created_at, u.last_login_at, u.status,
      (SELECT COUNT(*) FROM audit_logs a WHERE a.performed_by = u.id AND a.action = 'login') AS total_logins,
      (SELECT COUNT(*) FROM scorecards sc WHERE sc.employee_id = u.id) AS has_scorecard,
      (SELECT COUNT(*) FROM api_metrics m WHERE m.user_id = u.id) AS total_activity
    FROM users u ${w} ORDER BY u.created_at DESC LIMIT 200
  `).all(...params);
  const roles = db.prepare('SELECT DISTINCT role FROM users ORDER BY role').all().map((r) => r.role);
  res.json({ rows, roles });
});

router.get('/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, username, role, name, email, created_at, last_login_at, status, capability_match_pct FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const metrics = db.prepare('SELECT method, path, status, created_at FROM api_metrics WHERE user_id = ? ORDER BY id DESC LIMIT 2000').all(id);
  let scorecards_viewed = 0;
  let intelligence_used = 0;
  const modules = new Map();
  for (const r of metrics) {
    const c = classify(r.method, r.path);
    if (!c) continue;
    if (c.module === 'scorecard' && c.action === 'viewed_scorecard') scorecards_viewed++;
    if (c.module === 'intelligence') intelligence_used++;
    modules.set(c.module, (modules.get(c.module) || 0) + 1);
  }
  const stats = {
    total_logins: runOr0(`SELECT COUNT(*) c FROM audit_logs WHERE performed_by = ? AND action = 'login'`, id),
    scorecards_viewed,
    intelligence_used,
    evaluations_completed: runOr0(`SELECT COUNT(*) c FROM scoring_snapshots ss JOIN scorecards sc ON sc.id = ss.scorecard_id WHERE sc.employee_id = ?`, id),
    activities: [...modules.entries()].map(([module, c]) => ({ module, c })).sort((a, b) => b.c - a.c),
  };
  res.json({ user, stats });
});

router.patch('/users/:id/role', requirePermission('users.manage'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const role = String(req.body.role || '');
  if (!['admin', 'employee'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or employee' });
  }
  const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (id === req.user.id && role !== 'admin') return res.status(400).json({ error: "You can't demote yourself." });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  logAudit({ ...actor(req), action: 'changed_role', module: 'users', detail: `role ${target.username}: ${target.role} -> ${role}` });
  res.json({ ok: true });
});

router.patch('/users/:id/suspend', requirePermission('users.manage'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const suspended = req.body.suspended ? 'suspended' : 'active';
  const target = db.prepare('SELECT id, username, status FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (id === req.user.id && suspended === 'suspended') {
    return res.status(400).json({ error: 'You cannot suspend your own account.' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(suspended, id);
  logAudit({ ...actor(req), action: suspended === 'suspended' ? 'suspended_user' : 'reactivated_user', module: 'users', detail: target.username });
  res.json({ ok: true, suspended: suspended === 'suspended' });
});

// ----------------------------------------------------------- Roles & permissions
router.get('/roles', (req, res) => {
  const definitions = db.prepare('SELECT * FROM role_definitions ORDER BY rowid').all();
  const permissions = db.prepare('SELECT role, permission FROM role_permissions ORDER BY role, permission').all();
  const matrix = {};
  for (const p of permissions) {
    if (!matrix[p.role]) matrix[p.role] = [];
    matrix[p.role].push(p.permission);
  }
  res.json({ definitions, permissions: PERMISSIONS, matrix });
});

router.put('/roles/:role/permissions', requirePermission('roles.manage'), (req, res) => {
  const role = String(req.params.role || '');
  const perms = Array.isArray(req.body.permissions) ? req.body.permissions.filter((p) => PERMISSIONS.includes(p)) : [];
  if (!db.prepare('SELECT 1 FROM role_definitions WHERE role = ?').get(role)) {
    return res.status(404).json({ error: 'Unknown role' });
  }
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM role_permissions WHERE role = ?').run(role);
    const ins = db.prepare('INSERT INTO role_permissions (role, permission) VALUES (?, ?)');
    for (const p of perms) ins.run(role, p);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (ignored) {}
    return res.status(500).json({ error: e.message });
  }
  logAudit({ ...actor(req), action: 'updated_role_permissions', module: 'roles', detail: `${role}: ${perms.length} permission(s)` });
  res.json({ ok: true, role, permissions: perms });
});

// ----------------------------------------------------------- Evaluations & panels
router.get('/evaluations', (req, res) => {
  const status_counts = {
    pending: runOr0(`SELECT COUNT(*) c FROM approval_workflows WHERE completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM approval_panels p WHERE p.workflow_id = approval_workflows.id AND p.sent_at IS NOT NULL)`),
    in_progress: runOr0(`SELECT COUNT(*) c FROM approval_workflows WHERE completed_at IS NULL AND EXISTS (SELECT 1 FROM approval_panels p WHERE p.workflow_id = approval_workflows.id AND p.sent_at IS NOT NULL)`),
    completed: runOr0(`SELECT COUNT(*) c FROM approval_workflows WHERE completed_at IS NOT NULL`),
    rejected: runOr0(`SELECT COUNT(*) c FROM candidate_decisions WHERE decision='rejected'`),
    approved: runOr0(`SELECT COUNT(*) c FROM candidate_decisions WHERE decision='approved'`),
  };
  const avgCompletionDays = (() => {
    try {
      const r = db.prepare('SELECT AVG((julianday(completed_at) - julianday(created_at))) AS avg FROM approval_workflows WHERE completed_at IS NOT NULL').get();
      return r && r.avg != null ? Math.round(parseFloat(r.avg) * 10) / 10 : null;
    } catch (e) { return null; }
  })();
  const bottlenecks = (() => {
    try {
      return db.prepare(`
        SELECT p.id AS panel_id, p.panel_name, p.status, p.sent_at, w.candidate_id, u.name AS candidate,
          ROUND(julianday('now') - julianday(COALESCE(p.sent_at, w.created_at)), 1) AS days_waiting
        FROM approval_panels p JOIN approval_workflows w ON w.id = p.workflow_id
        LEFT JOIN users u ON u.id = w.candidate_id
        WHERE p.status IN ('awaiting','approved') AND w.completed_at IS NULL
        ORDER BY days_waiting DESC LIMIT 6
      `).all();
    } catch (e) { return []; }
  })();
  res.json({
    status_counts,
    avg_completion_days: avgCompletionDays,
    panel_members: runOr0(`SELECT COUNT(DISTINCT user_id) c FROM approval_members`),
    panels_sent: runOr0(`SELECT COUNT(*) c FROM approval_panels WHERE sent_at IS NOT NULL`),
    bottlenecks,
  });
});

// ---------------------------------------------------------- Candidates (funnel source)
router.get('/candidates', (req, res) => {
  const params = [];
  let w = "WHERE u.role = 'employee'";
  if (req.query.search) { w += ' AND (u.name LIKE ? OR u.email LIKE ?)'; const s = `%${req.query.search}%`; params.push(s, s); }
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.date_of_birth, u.created_at, u.status,
      u.capability_match_pct,
      sc.id AS scorecard_id, sc.updated_at AS scorecard_updated_at,
      (SELECT COUNT(*) FROM scorecard_updates su WHERE su.scorecard_id = sc.id) AS updates_count,
      ss.pursuit_priority_display, ss.final_decision, ss.candidate_fit, ss.joining_probability,
      (SELECT COUNT(*) FROM scores s WHERE s.scorecard_id = sc.id AND s.score IS NOT NULL) AS scored_count,
      (SELECT COUNT(*) FROM approval_workflows aw WHERE aw.candidate_id = u.id AND aw.completed_at IS NULL) AS active_workflow
    FROM users u
    LEFT JOIN scorecards sc ON sc.employee_id = u.id
    LEFT JOIN scoring_snapshots ss ON ss.scorecard_id = sc.id
    ${w} ORDER BY u.created_at DESC LIMIT 200
  `).all(...params);
  res.json({ rows });
});

router.get('/funnel', (req, res) => {
  const added = runOr0(`SELECT COUNT(*) c FROM users WHERE role='employee'`);
  const resumeAnalyzed = runOr0(`SELECT COUNT(*) c FROM users WHERE role='employee' AND resume_text IS NOT NULL AND length(resume_text) > 50 AND capability_match_pct IS NOT NULL`);
  const scorecardGenerated = runOr0(`SELECT COUNT(*) c FROM scorecards`);
  const evaluationStarted = runOr0(`SELECT COUNT(DISTINCT sc.employee_id) c FROM scorecards sc WHERE EXISTS (SELECT 1 FROM scorecard_updates su WHERE su.scorecard_id = sc.id) OR EXISTS (SELECT 1 FROM scores s WHERE s.scorecard_id = sc.id AND s.score IS NOT NULL)`);
  const panelReview = runOr0('SELECT COUNT(DISTINCT w.candidate_id) c FROM approval_workflows w') + runOr0('SELECT COUNT(DISTINCT candidate_id) c FROM candidate_decisions');
  const approved = runOr0(`SELECT COUNT(*) c FROM candidate_decisions WHERE decision='approved'`);
  const rejected = runOr0(`SELECT COUNT(*) c FROM candidate_decisions WHERE decision='rejected'`);
  res.json({
    funnel: [
      { stage: 'Candidates Added', count: added },
      { stage: 'Resume Analyzed', count: resumeAnalyzed },
      { stage: 'Scorecard Generated', count: scorecardGenerated },
      { stage: 'Evaluation Started', count: evaluationStarted },
      { stage: 'Panel Review', count: panelReview },
      { stage: 'Approved / Rejected', count: approved + rejected },
    ],
    outcomes: { approved, rejected, pending: Math.max(0, panelReview - approved - rejected) },
  });
});

// -------------------------------------------------------- Content / configuration
router.get('/content', (req, res) => {
  const parameters = db.prepare('SELECT id, name, description, weightage, grp, status FROM parameters ORDER BY id').all();
  const orgSettings = db.prepare('SELECT key, value FROM org_settings ORDER BY key').all();
  let company = null;
  try { company = db.prepare('SELECT * FROM company_numerology_profiles LIMIT 1').get() || null; } catch (e) {}
  const jdStats = {
    total: runOr0('SELECT COUNT(*) c FROM job_descriptions'),
    with_hash: runOr0('SELECT COUNT(*) c FROM job_descriptions WHERE jd_hash IS NOT NULL'),
    keywords: runOr0('SELECT COUNT(*) c FROM jd_keywords'),
  };
  const rules = db.prepare('SELECT rules_version, calculated_at FROM scoring_snapshots ORDER BY id DESC LIMIT 1').get();
  res.json({ parameters, org_settings: orgSettings, company, jd_stats: jdStats, rules_version: rules ? rules.rules_version : null });
});

router.put('/settings/:key', requirePermission('settings.manage'), (req, res) => {
  const key = String(req.params.key || '').trim();
  if (!key) return res.status(400).json({ error: 'Key is required' });
  const value = String(req.body.value == null ? '' : req.body.value);
  db.prepare(`INSERT INTO org_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  logAudit({ ...actor(req), action: 'updated_setting', module: 'settings', detail: key });
  res.json({ ok: true, key, value });
});

router.delete('/settings/:key', requirePermission('settings.manage'), (req, res) => {
  const key = String(req.params.key || '').trim();
  db.prepare('DELETE FROM org_settings WHERE key = ?').run(key);
  logAudit({ ...actor(req), action: 'deleted_setting', module: 'settings', detail: key });
  res.json({ ok: true });
});

// --------------------------------------------------------------- Notifications
router.get('/notifications', (req, res) => {
  const max = Math.min(100, parseInt(req.query.limit || '40', 10));
  try {
    const rows = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(max);
    res.json({ rows });
  } catch (e) {
    res.json({ rows: [] });
  }
});

router.get('/notifications/unread-count', (req, res) => {
  try {
    res.json({ unread: runOr0('SELECT COUNT(*) c FROM notifications WHERE read = 0') });
  } catch (e) {
    res.json({ unread: 0 });
  }
});

router.post('/notifications/generate', (req, res) => {
  const created = [];
  try {
    const activePanels = db.prepare(`
      SELECT p.id AS panel_id, p.panel_name, u.name AS candidate
      FROM approval_panels p JOIN approval_workflows w ON w.id = p.workflow_id
      LEFT JOIN users u ON u.id = w.candidate_id
      WHERE p.status IN ('awaiting','approved') AND w.completed_at IS NULL
    `).all();
    for (const p of activePanels.slice(0, 10)) {
      const fp = `panel_pending:${p.panel_id}`;
      if (createNotification({ type: 'alert', title: 'Panel awaiting review', body: `${p.panel_name || 'Panel'} - ${p.candidate || 'candidate'}`, link: '/decision-center', fingerprint: fp })) created.push(fp);
    }
  } catch (e) {}
  try {
    const newCands = db.prepare(`SELECT id, name FROM users WHERE role = 'employee' AND date(created_at) = date('now') LIMIT 10`).all();
    for (const c of newCands) {
      const fp = `new_candidate:${c.id}`;
      if (createNotification({ type: 'info', title: 'New candidate added', body: c.name, link: `/scores/${c.id}`, fingerprint: fp })) created.push(fp);
    }
  } catch (e) {}
  try {
    const failToday = runOr0(`SELECT COUNT(*) c FROM error_logs WHERE module='intelligence' AND date(created_at) = date('now')`);
    if (failToday > 0) {
      if (createNotification({ type: 'alert', title: `${failToday} failed analysis(es) today`, body: 'Check System Health for details.', link: '/admin-panel?module=settings', fingerprint: `intel_fail:${new Date().toISOString().slice(0, 10)}` })) created.push('intel_fail');
    }
  } catch (e) {}
  res.json({ generated: created.length, created });
});

router.post('/notifications/:id/read', (req, res) => {
  try { db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(parseInt(req.params.id, 10)); } catch (e) {}
  res.json({ ok: true });
});

router.post('/notifications/read-all', (req, res) => {
  try { db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run(); } catch (e) {}
  res.json({ ok: true });
});

// ------------------------------------------------------------------ Audit logs
router.get('/audit-logs', (req, res) => {
  const params = [];
  let w = 'WHERE 1=1';
  if (req.query.module) { w += ' AND module = ?'; params.push(req.query.module); }
  if (req.query.action) { w += ' AND action = ?'; params.push(req.query.action); }
  if (req.query.user) { w += ' AND username = ?'; params.push(req.query.user); }
  if (req.query.search) { w += ' AND (detail LIKE ? OR username LIKE ?)'; const s = `%${req.query.search}%`; params.push(s, s); }
  params.push(Math.min(200, parseInt(req.query.limit || '80', 10)));
  const rows = db.prepare(`
    SELECT id, username, action, module, detail, performed_by, created_at
    FROM audit_logs ${w} ORDER BY id DESC LIMIT ?
  `).all(...params);
  const modules = db.prepare('SELECT DISTINCT module FROM audit_logs ORDER BY module').all().map((r) => r.module);
  res.json({ rows, modules });
});

// -------------------------------------------------------------------- Settings
router.get('/settings', (req, res) => {
  const settings = db.prepare('SELECT key, value FROM org_settings ORDER BY key').all();
  const features = {};
  const featureCandidates = ['ENABLE_INNER_INTELLIGENCE', 'ENABLE_EXCEL_IMPORT', 'ENABLE_INTEGRITY_CHECK'];
  for (const f of featureCandidates) {
    try {
      const row = db.prepare('SELECT value FROM org_settings WHERE key = ?').get(`settings.feature.${f}`);
      features[f] = row ? row.value === 'true' || row.value === '1' : (process.env[f] === 'true' || process.env[f] === '1');
    } catch (e) {
      features[f] = false;
    }
  }
  res.json({
    env: {
      node: process.version,
      port: process.env.PORT || 5000,
      sqlite_path: process.env.SQLITE_PATH || 'backend/scorecard.db',
      cors_origins: process.env.CORS_ORIGINS || '(default allowlist)',
      jwt_secret_set: Boolean(process.env.JWT_SECRET),
      admin_password_env: Boolean(process.env.ADMIN_PASSWORD),
      employee_password_env: Boolean(process.env.EMPLOYEE_PASSWORD),
      admin_allowed_emails: Boolean(process.env.ADMIN_ALLOWED_EMAILS),
      firebase_configured: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    },
    features,
    settings,
    server_time: sqlNow(),
  });
});

router.put('/settings/feature/:key', requirePermission('settings.manage'), (req, res) => {
  const key = String(req.params.key || '');
  const enabled = Boolean(req.body.enabled);
  setFeature(key, enabled);
  logAudit({ ...actor(req), action: 'set_feature_flag', module: 'settings', detail: `${key}=${enabled}` });
  res.json({ ok: true, key, enabled });
});

// ---------------------------------------------------------------------- Health
router.get('/_debug-metrics', (req, res) => {
  try {
    const c = db.prepare('SELECT COUNT(*) c FROM api_metrics').get();
    const last = db.prepare('SELECT * FROM api_metrics ORDER BY id DESC LIMIT 3').all();
    res.json({ count: c.c, last });
  } catch (e) {
    res.json({ error: e.message });
  }
});

router.get('/health', (req, res) => {
  let dbOk = false;
  try { dbOk = Boolean(db.prepare('SELECT 1 AS ok').get()); } catch (e) {}
  const totalRequests = runOr0('SELECT COUNT(*) c FROM api_metrics');
  const todayRequests = runOr0(`SELECT COUNT(*) c FROM api_metrics WHERE date(created_at) = date('now')`);
  const errors = runOr0('SELECT COUNT(*) c FROM error_logs');
  const errorsToday = runOr0(`SELECT COUNT(*) c FROM error_logs WHERE date(created_at) = date('now')`);
  const authFailures = runOr0(`SELECT COUNT(*) c FROM audit_logs WHERE action = 'login_failed'`);
  const fivexx = runOr0('SELECT COUNT(*) c FROM api_metrics WHERE status >= 500');
  const avgMs = (() => {
    try { const r = db.prepare('SELECT AVG(duration_ms) AS a FROM api_metrics WHERE status < 500').get(); return r && r.a != null ? Math.round(parseFloat(r.a)) : null; } catch (e) { return null; }
  })();
  const lastErrors = db.prepare('SELECT message, path, created_at FROM error_logs ORDER BY id DESC LIMIT 5').all();
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    uptime_seconds: Math.round(process.uptime()),
    uptime_human: `${Math.floor(process.uptime() / 60)}m ${Math.round(process.uptime() % 60)}s`,
    db: dbOk ? 'ok' : 'error',
    request_count: { total: totalRequests, today: todayRequests, '5xx': fivexx },
    error_count: { total: errors, today: errorsToday },
    auth_failures: authFailures,
    avg_response_ms: avgMs,
    recent_errors: lastErrors,
  });
});

module.exports = router;