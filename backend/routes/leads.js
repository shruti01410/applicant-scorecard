// Admin lead-desk API (JWT + admin role).
//   GET    /api/admin/leads                 — list + filters + CSV export
//   GET    /api/admin/leads/:id             — detail + journey
//   PATCH  /api/admin/leads/:id             — status update
//   GET    /api/admin/tracking/analytics    — visitors/sources/pages rollup
//   GET    /api/admin/tracking/visitors     — visitor list + journeys
//   GET    /api/admin/tracking/share-links  — share links CRUD
//   POST   /api/admin/tracking/share-links
//   PATCH  /api/admin/tracking/share-links/:id
//   POST   /api/admin/tracking/deliveries/:id/retry — webhook/email retry
const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { newShareCode } = require('../trackingDb');
const { attemptDelivery } = require('../leadNotify');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'closed'];

function parseJson(s, fallback = null) {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

// ---------- leads ----------

router.get('/leads', (req, res) => {
  try {
    const where = [];
    const args = [];
    const status = String(req.query.status || '').trim();
    if (status && LEAD_STATUSES.includes(status)) { where.push('l.status = ?'); args.push(status); }
    const q = String(req.query.q || '').trim();
    if (q) {
      where.push('(l.name LIKE ? OR l.email LIKE ? OR l.company LIKE ?)');
      const like = `%${q}%`;
      args.push(like, like, like);
    }
    const sql = `
      SELECT l.id, l.name, l.email, l.company, l.phone, l.interest, l.message, l.status,
             l.attribution, l.source_path, l.created_at, l.updated_at, l.share_link_id,
             sl.code AS share_code, sl.label AS share_label
      FROM leads l
      LEFT JOIN share_links sl ON sl.id = l.share_link_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.created_at DESC
      LIMIT 500
    `;
    const rows = db.prepare(sql).all(...args).map((r) => ({
      ...r,
      attribution: parseJson(r.attribution),
    }));
    const counts = db.prepare(`
      SELECT status, COUNT(*) AS n FROM leads GROUP BY status
    `).all();
    const summary = { total: 0 };
    for (const c of counts) { summary[c.status] = c.n; summary.total += c.n; }
    return res.json({ leads: rows, summary });
  } catch (e) {
    console.error('[admin/leads]', e.message);
    return res.status(500).json({ error: 'Could not load leads' });
  }
});

router.get('/leads/export', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT l.id, l.created_at, l.name, l.email, l.company, l.phone, l.interest, l.status,
             l.message, l.source_path, l.attribution
      FROM leads l ORDER BY l.created_at DESC LIMIT 5000
    `).all();
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'id,created_at,name,email,company,phone,interest,status,source_path,utm_source,utm_campaign,click_id,message';
    const lines = rows.map((r) => {
      const a = parseJson(r.attribution) || {};
      return [
        r.id, r.created_at, r.name, r.email, r.company || '', r.phone || '', r.interest || '',
        r.status, r.source_path || '', a.utm_source || '', a.utm_campaign || '',
        a.gclid || a.msclkid || a.li_fat_id || a.fbclid || a.sl || '', r.message || '',
      ].map(esc).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send([header, ...lines].join('\r\n'));
  } catch (e) {
    console.error('[admin/leads/export]', e.message);
    return res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/leads/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const lead = db.prepare(`
      SELECT l.*, sl.code AS share_code, sl.label AS share_label
      FROM leads l LEFT JOIN share_links sl ON sl.id = l.share_link_id WHERE l.id = ?
    `).get(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    lead.attribution = parseJson(lead.attribution);
    const deliveries = db.prepare('SELECT * FROM lead_deliveries WHERE lead_id = ? ORDER BY id').all(id);
    let journey = [];
    if (lead.visitor_id) {
      journey = db.prepare(`
        SELECT event_type, path, title, meta, created_at FROM visitor_events
        WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 100
      `).all(lead.visitor_id);
      journey.forEach((j) => { j.meta = parseJson(j.meta); });
      var visitor = db.prepare(`
        SELECT visitor_uuid, first_seen_at, last_seen_at, first_touch, last_touch, landing_path, referrer, event_count
        FROM visitors WHERE id = ?
      `).get(lead.visitor_id);
      if (visitor) {
        visitor.first_touch = parseJson(visitor.first_touch);
        visitor.last_touch = parseJson(visitor.last_touch);
      }
    }
    return res.json({ lead, deliveries, journey, visitor: visitor || null });
  } catch (e) {
    console.error('[admin/leads/:id]', e.message);
    return res.status(500).json({ error: 'Could not load lead' });
  }
});

router.patch('/leads/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body && req.body.status || '').trim();
    if (!LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${LEAD_STATUSES.join(', ')}` });
    }
    const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Lead not found' });
    db.prepare(`UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    logAudit({ performedBy: req.user.id, username: req.user.username, action: 'lead_status_changed', targetType: 'lead', targetId: id, detail: { status }, module: 'tracking', req });
    return res.json({ ok: true, id, status });
  } catch (e) {
    console.error('[admin/leads/patch]', e.message);
    return res.status(500).json({ error: 'Update failed' });
  }
});

router.post('/tracking/deliveries/:id/retry', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await attemptDelivery(id);
    if (!row) return res.status(404).json({ error: 'Delivery not found' });
    return res.json({ delivery: row });
  } catch (e) {
    console.error('[admin/deliveries/retry]', e.message);
    return res.status(500).json({ error: 'Retry failed' });
  }
});

// ---------- analytics ----------

router.get('/tracking/analytics', (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 180);
    const since = `datetime('now', '-${days} days')`;

    const totals = {
      visitors: db.prepare(`SELECT COUNT(*) AS n FROM visitors WHERE last_seen_at >= ${since}`).get().n,
      sessions: db.prepare(`SELECT COUNT(*) AS n FROM visitor_sessions WHERE last_seen_at >= ${since}`).get().n,
      events: db.prepare(`SELECT COUNT(*) AS n FROM visitor_events WHERE created_at >= ${since}`).get().n,
      shareClicks: db.prepare(`SELECT COUNT(*) AS n FROM visitor_events WHERE event_type = 'share_click' AND created_at >= ${since}`).get().n,
      leads: db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE created_at >= ${since}`).get().n,
    };

    const daily = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS n FROM visitor_events
      WHERE created_at >= ${since} GROUP BY day ORDER BY day
    `).all();

    const pages = db.prepare(`
      SELECT path, COUNT(*) AS n FROM visitor_events
      WHERE event_type = 'page_view' AND path IS NOT NULL AND created_at >= ${since}
      GROUP BY path ORDER BY n DESC LIMIT 15
    `).all();

    const eventTypes = db.prepare(`
      SELECT event_type, COUNT(*) AS n FROM visitor_events
      WHERE created_at >= ${since} GROUP BY event_type ORDER BY n DESC
    `).all();

    // Source rollup from first-touch (each visitor counted once).
    const visitors = db.prepare(`
      SELECT first_touch, last_touch FROM visitors WHERE last_seen_at >= ${since}
    `).all();
    const bySource = {};
    for (const v of visitors) {
      const ft = parseJson(v.first_touch) || {};
      const key = ft.utm_source || ft.src || (ft.referrer ? new URL(ft.referrer).hostname : null) || 'direct';
      bySource[key] = (bySource[key] || 0) + 1;
    }
    const sourceRows = Object.entries(bySource)
      .map(([source, visitors_count]) => ({ source, visitors: visitors_count }))
      .sort((a, b) => b.visitors - a.visitors);

    const leadsByDay = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS n FROM leads
      WHERE created_at >= ${since} GROUP BY day ORDER BY day
    `).all();

    const shareLinks = db.prepare(`
      SELECT id, code, label, target_path, utm, active, clicks, created_at,
        (SELECT COUNT(*) FROM leads l WHERE l.share_link_id = share_links.id) AS leads
      FROM share_links ORDER BY created_at DESC
    `).all();
    shareLinks.forEach((s) => { s.utm = parseJson(s.utm, {}); });

    return res.json({ days, totals, daily, pages, eventTypes, sources: sourceRows, leadsByDay, shareLinks });
  } catch (e) {
    console.error('[admin/tracking/analytics]', e.message);
    return res.status(500).json({ error: 'Analytics failed' });
  }
});

router.get('/tracking/visitors', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.id, v.visitor_uuid, v.first_seen_at, v.last_seen_at, v.first_touch, v.last_touch,
             v.landing_path, v.referrer, v.event_count,
             (SELECT COUNT(*) FROM visitor_sessions s WHERE s.visitor_id = v.id) AS sessions,
             (SELECT l.id FROM leads l WHERE l.visitor_id = v.id ORDER BY l.id DESC LIMIT 1) AS lead_id
      FROM visitors v ORDER BY v.last_seen_at DESC LIMIT 200
    `).all();
    rows.forEach((r) => {
      r.first_touch = parseJson(r.first_touch);
      r.last_touch = parseJson(r.last_touch);
    });
    return res.json({ visitors: rows });
  } catch (e) {
    console.error('[admin/tracking/visitors]', e.message);
    return res.status(500).json({ error: 'Visitors failed' });
  }
});

router.get('/tracking/visitors/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const visitor = db.prepare(`
      SELECT id, visitor_uuid, first_seen_at, last_seen_at, first_touch, last_touch,
             landing_path, referrer, event_count FROM visitors WHERE id = ?
    `).get(id);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });
    visitor.first_touch = parseJson(visitor.first_touch);
    visitor.last_touch = parseJson(visitor.last_touch);
    const events = db.prepare(`
      SELECT id, event_type, path, title, meta, created_at FROM visitor_events
      WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 200
    `).all(id);
    events.forEach((e) => { e.meta = parseJson(e.meta); });
    const sessions = db.prepare(`
      SELECT id, session_uuid, started_at, last_seen_at, page_views FROM visitor_sessions
      WHERE visitor_id = ? ORDER BY last_seen_at DESC
    `).all(id);
    return res.json({ visitor, events, sessions });
  } catch (e) {
    console.error('[admin/tracking/visitor]', e.message);
    return res.status(500).json({ error: 'Visitor failed' });
  }
});

// ---------- share links ----------

router.post('/tracking/share-links', (req, res) => {
  try {
    const body = req.body || {};
    const label = String(body.label || '').trim().slice(0, 120) || 'Untitled link';
    let target = String(body.target_path || '/explore').trim().slice(0, 300);
    if (!target.startsWith('/') || target.startsWith('//')) target = '/explore';
    const utm = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = body.utm && body.utm[k];
      if (v != null && String(v).trim() !== '') utm[k] = String(v).trim().slice(0, 200);
    }
    if (!utm.utm_source) utm.utm_source = 'share';
    const code = newShareCode();
    const r = db.prepare(`
      INSERT INTO share_links (code, label, target_path, utm, created_by) VALUES (?, ?, ?, ?, ?)
    `).run(code, label, target, JSON.stringify(utm), req.user.id);
    const row = db.prepare('SELECT * FROM share_links WHERE id = ?').get(Number(r.lastInsertRowid));
    row.utm = parseJson(row.utm, {});
    logAudit({ performedBy: req.user.id, username: req.user.username, action: 'share_link_created', targetType: 'share_link', targetId: row.id, detail: { label, target }, module: 'tracking', req });
    return res.json({ shareLink: row });
  } catch (e) {
    console.error('[admin/share-links]', e.message);
    return res.status(500).json({ error: 'Could not create share link' });
  }
});

router.patch('/tracking/share-links/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM share_links WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Share link not found' });
    const body = req.body || {};
    if (typeof body.active === 'boolean') {
      db.prepare('UPDATE share_links SET active = ? WHERE id = ?').run(body.active ? 1 : 0, id);
    }
    const updated = db.prepare('SELECT * FROM share_links WHERE id = ?').get(id);
    updated.utm = parseJson(updated.utm, {});
    return res.json({ shareLink: updated });
  } catch (e) {
    console.error('[admin/share-links/patch]', e.message);
    return res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/tracking/share-links/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id FROM share_links WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Share link not found' });
    db.prepare('UPDATE share_links SET active = 0 WHERE id = ?').run(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/share-links/delete]', e.message);
    return res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
