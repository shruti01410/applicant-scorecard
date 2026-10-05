// Public tracking endpoints — NO auth (rate-limited + size-capped).
//   POST /api/track/event  — batched visitor/session/event ingest
//   POST /api/track/lead   — lead capture (honeypot + time-trap)
//   GET  /l/:code          — short-link redirect (mounted at /l, before SPA)
const express = require('express');
const db = require('../database');
const { rateLimit } = require('../security');
const { hashIp, newShareCode } = require('../trackingDb');
const { enqueueDeliveries, deliverLeadAsync } = require('../leadNotify');

const router = express.Router();

const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many tracking events. Please try again shortly.',
});
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many submissions. Please wait a few minutes and try again.',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 20;
const KNOWN_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'msclkid', 'li_fat_id', 'fbclid', 'ttclid', 'src', 'ref', 'campaign',
];

function clean(value, max) {
  if (value == null) return null;
  return String(value).slice(0, max);
}

function touchFrom(query) {
  if (!query || typeof query !== 'object') return null;
  const out = {};
  for (const k of KNOWN_PARAMS) {
    const v = query[k];
    if (v != null && String(v).trim() !== '') out[k] = clean(v, 200);
  }
  return Object.keys(out).length ? out : null;
}

function clientIp(req) {
  return String(req.ip || '').split(',')[0].trim() || null;
}

// ---------- visitors / sessions ----------

function upsertVisitor({ uuid, firstTouch, lastTouch, landing, referrer, ua, ip }) {
  let row = db.prepare('SELECT id FROM visitors WHERE visitor_uuid = ?').get(uuid);
  if (!row) {
    const r = db.prepare(`
      INSERT INTO visitors (visitor_uuid, first_touch, last_touch, landing_path, referrer, user_agent, ip_hash, event_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(uuid, firstTouch ? JSON.stringify(firstTouch) : null, lastTouch ? JSON.stringify(lastTouch) : null,
      clean(landing, 300), clean(referrer, 500), clean(ua, 300), hashIp(ip));
    row = { id: Number(r.lastInsertRowid) };
  } else {
    // First touch is immutable; last touch updates every request.
    db.prepare(`
      UPDATE visitors SET last_seen_at = datetime('now'), last_touch = COALESCE(?, last_touch),
        user_agent = COALESCE(?, user_agent), event_count = event_count + ? WHERE id = ?
    `).run(lastTouch ? JSON.stringify(lastTouch) : null, clean(ua, 300), 0, row.id);
  }
  return row.id;
}

function upsertSession({ uuid, visitorId, referrer }) {
  let row = db.prepare('SELECT id FROM visitor_sessions WHERE session_uuid = ?').get(uuid);
  if (!row) {
    const r = db.prepare(`
      INSERT INTO visitor_sessions (session_uuid, visitor_id, referrer) VALUES (?, ?, ?)
    `).run(uuid, visitorId, clean(referrer, 500));
    row = { id: Number(r.lastInsertRowid) };
  } else {
    db.prepare(`UPDATE visitor_sessions SET last_seen_at = datetime('now'), page_views = page_views + ? WHERE id = ?`)
      .run(0, row.id);
  }
  return row.id;
}

// ---------- POST /event ----------

router.post('/event', eventLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const visitorUuid = clean(body.visitor_uuid, 64) || '';
    const sessionUuid = clean(body.session_uuid, 64) || '';
    if (!UUID_RE.test(visitorUuid) || !UUID_RE.test(sessionUuid)) {
      return res.status(400).json({ error: 'visitor_uuid and session_uuid are required' });
    }
    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
    if (!events.length) return res.status(400).json({ error: 'No events supplied' });

    const ua = req.headers['user-agent'];
    const ip = clientIp(req);
    const visitorId = upsertVisitor({
      uuid: visitorUuid,
      firstTouch: touchFrom(body.first_params) || null,
      lastTouch: touchFrom(body.last_params) || null,
      landing: body.landing_path,
      referrer: body.referrer,
      ua,
      ip,
    });
    const sessionId = upsertSession({ uuid: sessionUuid, visitorId, referrer: body.referrer });

    const insert = db.prepare(`
      INSERT INTO visitor_events (visitor_id, session_id, event_type, path, title, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    let stored = 0;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const type = clean(ev.type, 40);
      if (!type) continue;
      try {
        insert.run(visitorId, sessionId, type, clean(ev.path, 300), clean(ev.title, 200),
          ev.meta && typeof ev.meta === 'object' ? JSON.stringify(ev.meta).slice(0, 2000) : null);
        stored += 1;
      } catch (e) { /* skip malformed row */ }
    }
    db.prepare('UPDATE visitors SET event_count = event_count + ? WHERE id = ?').run(stored, visitorId);
    return res.json({ ok: true, stored });
  } catch (e) {
    console.error('[track/event]', e.message);
    return res.status(500).json({ error: 'Tracking ingest failed' });
  }
});

// ---------- POST /lead ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/lead', leadLimiter, (req, res) => {
  try {
    const body = req.body || {};
    // Honeypot: bots fill every field. Time-trap: form opened < 1.5s ago.
    if (clean(body.website, 200)) return res.json({ ok: true });
    const renderedAt = Number(body.rendered_at) || 0;
    if (!renderedAt || Date.now() - renderedAt < 1500) return res.json({ ok: true });

    const name = clean(body.name, 120);
    const email = clean(body.email, 200);
    if (!name || !email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Name and a valid email are required.' });
    }
    const attribution = touchFrom(body.last_params) || touchFrom(body.first_params) || null;
    const visitorUuid = clean(body.visitor_uuid, 64);
    const sessionUuid = clean(body.session_uuid, 64);
    let visitorId = null;
    let sessionId = null;
    if (UUID_RE.test(visitorUuid)) {
      const v = db.prepare('SELECT id FROM visitors WHERE visitor_uuid = ?').get(visitorUuid);
      if (v) visitorId = v.id;
    }
    if (UUID_RE.test(sessionUuid)) {
      const s = db.prepare('SELECT id FROM visitor_sessions WHERE session_uuid = ?').get(sessionUuid);
      if (s) sessionId = s.id;
    }
    let shareLinkId = null;
    const shareCode = clean(body.share_code, 32);
    if (shareCode) {
      const sl = db.prepare('SELECT id FROM share_links WHERE code = ?').get(shareCode);
      if (sl) shareLinkId = sl.id;
    }

    const r = db.prepare(`
      INSERT INTO leads (visitor_id, session_id, share_link_id, name, email, company, phone, interest, message, attribution, source_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `).run(
      visitorId, sessionId, shareLinkId, name, email,
      clean(body.company, 120), clean(body.phone, 40), clean(body.interest, 60),
      clean(body.message, 2000),
      attribution ? JSON.stringify(attribution) : null,
      clean(body.source_path, 300)
    );
    const leadId = Number(r.lastInsertRowid);
    enqueueDeliveries(leadId);
    deliverLeadAsync(leadId);
    try {
      const ev = db.prepare('INSERT INTO visitor_events (visitor_id, session_id, event_type, path, meta) VALUES (?, ?, ?, ?, ?)');
      ev.run(visitorId, sessionId, 'lead_submit', clean(body.source_path, 300), JSON.stringify({ lead_id: leadId }));
    } catch (e) { /* best effort */ }
    return res.json({ ok: true, id: leadId });
  } catch (e) {
    console.error('[track/lead]', e.message);
    return res.status(500).json({ error: 'Could not save your request. Please try again.' });
  }
});

// ---------- share links (create is admin-only; this router only resolves) ----------

function redirectForShare(row, req, res) {
  let utm = {};
  try { utm = row.utm ? JSON.parse(row.utm) : {}; } catch (e) { utm = {}; }
  const target = row.target_path && row.target_path.startsWith('/') ? row.target_path : '/explore';
  const params = new URLSearchParams();
  params.set('sl', row.code);
  params.set('src', utm.utm_source || 'share');
  for (const [k, v] of Object.entries(utm)) {
    if (v != null && String(v).trim() !== '') params.set(k, String(v));
  }
  try {
    db.prepare('UPDATE share_links SET clicks = clicks + 1 WHERE id = ?').run(row.id);
    db.prepare('INSERT INTO visitor_events (share_link_id, event_type, path, meta) VALUES (?, ?, ?, ?)')
      .run(row.id, 'share_click', target, JSON.stringify({ code: row.code, ip_hash: hashIp(clientIp(req)) }));
  } catch (e) { /* best effort */ }
  return res.redirect(302, `${target}?${params.toString()}`);
}

// Used by the SPA fallback route in dev (vite serves index.html for /l/:code).
router.get('/link/:code', (req, res) => {
  const code = String(req.params.code || '').toLowerCase().slice(0, 32);
  const row = db.prepare('SELECT * FROM share_links WHERE code = ? AND active = 1').get(code);
  if (!row) return res.status(404).json({ error: 'Unknown share link' });
  let utm = {};
  try { utm = row.utm ? JSON.parse(row.utm) : {}; } catch (e) { utm = {}; }
  const target = row.target_path && row.target_path.startsWith('/') ? row.target_path : '/explore';
  const params = new URLSearchParams();
  params.set('sl', row.code);
  params.set('src', utm.utm_source || 'share');
  for (const [k, v] of Object.entries(utm)) {
    if (v != null && String(v).trim() !== '') params.set(k, String(v));
  }
  try {
    db.prepare('UPDATE share_links SET clicks = clicks + 1 WHERE id = ?').run(row.id);
    db.prepare('INSERT INTO visitor_events (share_link_id, event_type, path, meta) VALUES (?, ?, ?, ?)')
      .run(row.id, 'share_click', target, JSON.stringify({ code: row.code, ip_hash: hashIp(clientIp(req)) }));
  } catch (e) { /* best effort */ }
  return res.json({ target: `${target}?${params.toString()}` });
});

module.exports = router;
module.exports.redirectRouter = express.Router();
// Short-link 302 — mounted at /l BEFORE the SPA fallback in server.js.
module.exports.redirectRouter.get('/:code', (req, res, next) => {
  try {
    const code = String(req.params.code || '').toLowerCase().slice(0, 32);
    const row = db.prepare('SELECT * FROM share_links WHERE code = ? AND active = 1').get(code);
    if (!row) return res.status(404).send('Link not found');
    return redirectForShare(row, req, res);
  } catch (e) {
    return next(e);
  }
});
