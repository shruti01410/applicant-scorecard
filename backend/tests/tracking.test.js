const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

function seededDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT,
      role TEXT NOT NULL, name TEXT NOT NULL, email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, performed_by INTEGER, user_id INTEGER,
      username TEXT, action TEXT NOT NULL, target_type TEXT, target_id INTEGER,
      module TEXT, detail TEXT, ip TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (1, 'test123', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com');
    INSERT INTO users (id, username, password, role, name, email)
    VALUES (2, 'hkhan', 'x', 'employee', 'H Khan', 'hkhan@example.com');
    -- tracking schema mirrors trackingDb.js so seeds can run before routes load
    CREATE TABLE share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      label TEXT,
      target_path TEXT DEFAULT '/explore',
      utm TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

async function req(base, path, opts = {}) {
  const headers = { Connection: 'close', 'Content-Type': 'application/json', ...(opts.headers || {}) };
  return fetch(`${base}${path}`, { ...opts, headers });
}

async function withApi(db, handler) {
  const overridePaths = ['./database', './middleware/auth'].map((p) => require.resolve(`../${p.slice(2)}`));
  const reloadPaths = ['./routes/track', './routes/leads', './trackingDb', './leadNotify', './audit']
    .map((p) => require.resolve(`../${p.slice(2)}`));
  const cached = [...overridePaths, ...reloadPaths].map((p) => [p, require.cache[p]]);
  const currentUser = { id: 1, role: 'admin', username: 'test123' };
  let server;
  try {
    require.cache[overridePaths[0]] = { exports: db };
    require.cache[overridePaths[1]] = {
      exports: {
        authenticate: (r, s, next) => { r.user = { ...currentUser }; next(); },
        requireRole: (role) => (r, s, next) => {
          if (r.user && r.user.role === role) return next();
          return s.status(403).json({ error: 'Forbidden' });
        },
      },
    };
    reloadPaths.forEach((p) => delete require.cache[p]);
    const app = express();
    app.use(express.json());
    app.use('/api/track', require('../routes/track'));
    app.use('/l', require('../routes/track').redirectRouter);
    app.use('/api/admin', require('../routes/leads'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await handler(base, (user) => { currentUser.id = user.id; currentUser.role = user.role; currentUser.username = user.username; });
  } finally {
    if (server) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    cached.forEach(([p, entry]) => {
      if (entry) require.cache[p] = entry;
      else delete require.cache[p];
    });
  }
}

const VID = '11111111-2222-3333-4444-555555555555';
const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function eventPayload(overrides = {}) {
  return JSON.stringify({
    visitor_uuid: VID,
    session_uuid: SID,
    landing_path: '/explore',
    referrer: 'https://www.linkedin.com/feed/',
    first_params: { utm_source: 'linkedin', utm_campaign: 'q3-pilot' },
    last_params: { utm_source: 'linkedin', gclid: 'abc123' },
    events: [{ type: 'page_view', path: '/explore', title: 'Explore HUMSEE SCORE' }],
    ...overrides,
  });
}

test('TR1. event ingest creates visitor, session and events with first-touch attribution', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/api/track/event', { method: 'POST', body: eventPayload() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.stored, 1);

    const v = db.prepare('SELECT * FROM visitors WHERE visitor_uuid = ?').get(VID);
    assert.ok(v, 'visitor row created');
    const ft = JSON.parse(v.first_touch);
    assert.equal(ft.utm_source, 'linkedin');
    assert.equal(ft.utm_campaign, 'q3-pilot');
    const lt = JSON.parse(v.last_touch);
    assert.equal(lt.gclid, 'abc123');
    assert.equal(v.landing_path, '/explore');
    assert.ok(v.ip_hash, 'IP stored only as hash');
    assert.equal(String(v.ip_hash).includes('127.0.0.1'), false);

    const s = db.prepare('SELECT * FROM visitor_sessions WHERE session_uuid = ?').get(SID);
    assert.ok(s, 'session row created');
    assert.equal(s.visitor_id, v.id);

    const events = db.prepare('SELECT * FROM visitor_events WHERE visitor_id = ?').all(v.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'page_view');
    assert.equal(events[0].path, '/explore');
    assert.equal(v.event_count, 1);
  });
});

test('TR2. first touch is immutable; last touch updates on every request', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    await req(base, '/api/track/event', { method: 'POST', body: eventPayload() });
    // Second hit with a DIFFERENT first-touch source (e.g. typed URL later).
    const second = eventPayload({
      first_params: { utm_source: 'newsletter' },
      last_params: { utm_source: 'newsletter', ref: 'email' },
      events: [{ type: 'cta_click', path: '/explore', meta: { button: 'start_pilot' } }],
    });
    const res = await req(base, '/api/track/event', { method: 'POST', body: second });
    assert.equal(res.status, 200);

    const v = db.prepare('SELECT * FROM visitors WHERE visitor_uuid = ?').get(VID);
    const ft = JSON.parse(v.first_touch);
    assert.equal(ft.utm_source, 'linkedin', 'first touch must NOT be overwritten');
    const lt = JSON.parse(v.last_touch);
    assert.equal(lt.utm_source, 'newsletter', 'last touch updates');
    assert.equal(v.event_count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitor_events').get().n, 2);
  });
});

test('TR3. event ingest rejects payloads without valid uuids or events', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const bad1 = await req(base, '/api/track/event', { method: 'POST', body: JSON.stringify({ events: [{ type: 'x' }] }) });
    assert.equal(bad1.status, 400);
    const bad2 = await req(base, '/api/track/event', {
      method: 'POST',
      body: JSON.stringify({ visitor_uuid: VID, session_uuid: SID, events: [] }),
    });
    assert.equal(bad2.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 0);
  });
});

test('TR4. lead honeypot is accepted silently and stores nothing', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/api/track/lead', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bot', email: 'bot@spam.com', website: 'http://spam.example',
        rendered_at: Date.now() - 5000,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.id, undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 0);
  });
});

test('TR5. lead time-trap (form opened < 1.5s ago) stores nothing', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const res = await req(base, '/api/track/lead', {
      method: 'POST',
      body: JSON.stringify({ name: 'Too Fast', email: 'fast@example.com', rendered_at: Date.now() - 200 }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, undefined);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 0);
  });
});

test('TR6. lead validation: invalid email 400, missing name 400', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const r1 = await req(base, '/api/track/lead', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', email: 'not-an-email', rendered_at: Date.now() - 5000 }),
    });
    assert.equal(r1.status, 400);
    const r2 = await req(base, '/api/track/lead', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'ok@example.com', rendered_at: Date.now() - 5000 }),
    });
    assert.equal(r2.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 0);
  });
});

test('TR7. valid lead stores row, journey event and enqueues webhook delivery', async () => {
  const db = seededDb();
  const hookHits = [];
  const hook = http.createServer((rq, rs) => {
    let data = '';
    rq.on('data', (c) => { data += c; });
    rq.on('end', () => {
      hookHits.push(JSON.parse(data));
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end('{"ok":true}');
    });
  });
  const hookPort = await new Promise((resolve) => {
    hook.listen(0, '127.0.0.1', () => resolve(hook.address().port));
  });
  process.env.LEAD_WEBHOOK_URL = `http://127.0.0.1:${hookPort}/hook`;
  try {
    await withApi(db, async (base) => {
      // seed visitor so the lead can link to a journey
      await req(base, '/api/track/event', { method: 'POST', body: eventPayload() });
      const res = await req(base, '/api/track/lead', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Jane Visitor', email: 'jane@acme.com', company: 'Acme', interest: '14-day pilot',
          message: 'We need help screening 50 CVs a month.',
          rendered_at: Date.now() - 4000,
          visitor_uuid: VID, session_uuid: SID, source_path: '/explore',
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.id, 'lead id returned');

      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(body.id);
      assert.equal(lead.name, 'Jane Visitor');
      assert.equal(lead.status, 'new');
      assert.equal(lead.visitor_id, 1);

      const ev = db.prepare("SELECT * FROM visitor_events WHERE event_type = 'lead_submit'").get();
      assert.ok(ev, 'lead_submit journey event recorded');

      const delivery = db.prepare('SELECT * FROM lead_deliveries WHERE lead_id = ?').get(body.id);
      assert.ok(delivery, 'delivery row enqueued');
      assert.equal(delivery.channel, 'webhook');

      // wait for the fire-and-forget attempt
      let sent = null;
      for (let i = 0; i < 40 && !sent; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        sent = db.prepare("SELECT * FROM lead_deliveries WHERE lead_id = ? AND status = 'sent'").get(body.id);
      }
      assert.ok(sent, 'webhook delivery marked sent');
      assert.equal(sent.attempts, 1);
      assert.equal(hookHits.length, 1);
      assert.equal(hookHits[0].type, 'lead.created');
      assert.equal(hookHits[0].lead.email, 'jane@acme.com');
    });
  } finally {
    delete process.env.LEAD_WEBHOOK_URL;
    await new Promise((r) => hook.close(r));
  }
});

test('TR8. lead endpoint rate-limits after 5 submissions in 15 minutes', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await req(base, '/api/track/lead', {
        method: 'POST',
        body: JSON.stringify({ name: `N${i}`, email: `n${i}@example.com`, rendered_at: Date.now() - 5000 }),
      });
    }
    assert.equal(last.status, 429);
  });
});

test('TR9. share-link redirect returns 302 with attribution, logs click + event', async () => {
  const db = seededDb();
  db.prepare(`
    INSERT INTO share_links (code, label, target_path, utm)
    VALUES ('q3linked', 'Q3 LinkedIn', '/explore', '{"utm_source":"linkedin","utm_campaign":"q3-pilot"}')
  `).run();
  await withApi(db, async (base) => {
    const res = await req(base, '/l/q3linked', { redirect: 'manual' });
    assert.equal(res.status, 302);
    const loc = res.headers.get('location');
    assert.ok(loc.startsWith('/explore?'), `redirect target got ${loc}`);
    assert.ok(loc.includes('sl=q3linked'));
    assert.ok(loc.includes('utm_source=linkedin'));
    assert.ok(loc.includes('utm_campaign=q3-pilot'));

    const sl = db.prepare('SELECT clicks FROM share_links WHERE code = ?').get('q3linked');
    assert.equal(sl.clicks, 1);
    const ev = db.prepare("SELECT * FROM visitor_events WHERE event_type = 'share_click'").get();
    assert.ok(ev, 'share_click event logged');
    assert.equal(ev.share_link_id, 1);

    // unknown / inactive code -> 404
    const missing = await req(base, '/l/zzzzzzzz', { redirect: 'manual' });
    assert.equal(missing.status, 404);
    db.prepare("UPDATE share_links SET active = 0 WHERE code = 'q3linked'").run();
    const inactive = await req(base, '/l/q3linked', { redirect: 'manual' });
    assert.equal(inactive.status, 404);
    assert.equal(db.prepare('SELECT clicks FROM share_links WHERE code = ?').get('q3linked').clicks, 1);
  });
});

test('TR10. JSON resolver /api/track/link/:code returns the target for SPA fallback', async () => {
  const db = seededDb();
  db.prepare(`
    INSERT INTO share_links (code, label, target_path, utm)
    VALUES ('json1', 'JSON link', '/explore', '{"utm_source":"whatsapp"}')
  `).run();
  await withApi(db, async (base) => {
    const res = await req(base, '/api/track/link/json1');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.target.startsWith('/explore?'));
    assert.ok(body.target.includes('utm_source=whatsapp'));
    assert.equal(db.prepare('SELECT clicks FROM share_links WHERE code = ?').get('json1').clicks, 1);
    const missing = await req(base, '/api/track/link/nope1234');
    assert.equal(missing.status, 404);
  });
});

test('TR11. admin leads list, status patch and CSV export', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const created = await req(base, '/api/track/lead', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Lead One', email: 'one@corp.com', company: 'Corp', rendered_at: Date.now() - 5000,
        source_path: '/explore', last_params: { utm_source: 'linkedin', utm_campaign: 'q3-pilot' },
      }),
    });
    const { id } = await created.json();

    const list = await req(base, '/api/admin/leads');
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.summary.total, 1);
    assert.equal(listBody.leads[0].email, 'one@corp.com');
    assert.equal(listBody.leads[0].attribution.utm_source, 'linkedin');

    const patch = await req(base, `/api/admin/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'contacted' }),
    });
    assert.equal(patch.status, 200);
    assert.equal(db.prepare('SELECT status FROM leads WHERE id = ?').get(id).status, 'contacted');

    const badPatch = await req(base, `/api/admin/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'not-a-status' }),
    });
    assert.equal(badPatch.status, 400);

    const csv = await req(base, '/api/admin/leads/export');
    assert.equal(csv.status, 200);
    const text = await csv.text();
    const lines = text.trim().split(/\r?\n/);
    assert.ok(lines[0].includes('utm_source'));
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes('one@corp.com'));
    assert.ok(lines[1].includes('linkedin'));

    const detail = await req(base, `/api/admin/leads/${id}`);
    const d = await detail.json();
    assert.equal(d.lead.id, id);
    assert.equal(d.deliveries.length, 0, 'no webhook env -> no delivery rows');
  });
});

test('TR12. tracking admin endpoints require the admin role', async () => {
  const db = seededDb();
  await withApi(db, async (base, asUser) => {
    asUser({ id: 2, role: 'employee', username: 'hkhan' });
    for (const path of ['/api/admin/leads', '/api/admin/tracking/analytics', '/api/admin/tracking/visitors', '/api/admin/tracking/share-links']) {
      const res = await req(base, path);
      assert.equal(res.status, 403, `${path} must 403 for employees`);
    }
    const post = await req(base, '/api/admin/tracking/share-links', { method: 'POST', body: JSON.stringify({ label: 'x' }) });
    assert.equal(post.status, 403);
  });
});

test('TR13. analytics rollup reports totals, sources, pages and share links', async () => {
  const db = seededDb();
  db.prepare(`
    INSERT INTO share_links (code, label, target_path, utm)
    VALUES ('analytics', 'Analytics link', '/explore', '{"utm_source":"twitter"}')
  `).run();
  await withApi(db, async (base) => {
    await req(base, '/api/track/event', { method: 'POST', body: eventPayload() });
    await req(base, '/api/track/event', {
      method: 'POST',
      body: eventPayload({ events: [{ type: 'page_view', path: '/explore' }, { type: 'tour_step', path: '/explore', meta: { step: 3 } }] }),
    });
    await req(base, '/l/analytics');
    const created = await req(base, '/api/track/lead', {
      method: 'POST',
      body: JSON.stringify({
        name: 'A', email: 'a@b.com', rendered_at: Date.now() - 5000,
        visitor_uuid: VID, session_uuid: SID, share_code: 'analytics',
      }),
    });
    assert.equal((await created.json()).id, 1);

    const res = await req(base, '/api/admin/tracking/analytics?days=30');
    assert.equal(res.status, 200);
    const a = await res.json();
    assert.equal(a.totals.visitors, 1);
    assert.equal(a.totals.events, 5); // 1 + 2 page events, 1 share_click, 1 lead_submit
    assert.equal(a.totals.shareClicks, 1);
    assert.equal(a.totals.leads, 1);
    assert.ok(a.daily.length >= 1);
    assert.ok(a.pages.some((p) => p.path === '/explore'));
    assert.ok(a.eventTypes.some((t) => t.event_type === 'tour_step'));
    assert.equal(a.sources[0].source, 'linkedin', 'first-touch source rollup');
    assert.equal(a.shareLinks.length, 1);
    assert.equal(a.shareLinks[0].code, 'analytics');
    assert.equal(a.shareLinks[0].leads, 1);
    assert.equal(typeof a.shareLinks[0].utm, 'object');

    const visitors = await req(base, '/api/admin/tracking/visitors');
    const vb = await visitors.json();
    assert.equal(vb.visitors.length, 1);
    assert.equal(vb.visitors[0].visitor_uuid, VID);
    assert.equal(vb.visitors[0].lead_id, 1);

    const vd = await req(base, '/api/admin/tracking/visitors/1');
    const vdb = await vd.json();
    assert.equal(vdb.visitor.visitor_uuid, VID);
    assert.ok(vdb.events.length >= 3);
    assert.ok(vdb.sessions.length >= 1);
  });
});

test('TR14. share-link create validates target path and applies UTM defaults', async () => {
  const db = seededDb();
  await withApi(db, async (base) => {
    const ok = await req(base, '/api/admin/tracking/share-links', {
      method: 'POST',
      body: JSON.stringify({
        label: 'Email footer', target_path: '/explore',
        utm: { utm_source: 'email', utm_medium: 'signature', utm_campaign: 'outbound' },
      }),
    });
    assert.equal(ok.status, 200);
    const { shareLink } = await ok.json();
    assert.match(shareLink.code, /^[a-z0-9]{8,}$/, 'short code generated');
    assert.equal(shareLink.utm.utm_medium, 'signature');
    assert.equal(shareLink.active, 1);

    // open-redirect attempts fall back to /explore
    const evil = await req(base, '/api/admin/tracking/share-links', {
      method: 'POST',
      body: JSON.stringify({ label: 'evil', target_path: 'https://evil.example/phish' }),
    });
    const evilBody = await evil.json();
    assert.equal(evilBody.shareLink.target_path, '/explore');

    // default utm_source applied when omitted
    const bare = await req(base, '/api/admin/tracking/share-links', {
      method: 'POST', body: JSON.stringify({ label: 'bare' }),
    });
    const bareBody = await bare.json();
    assert.equal(bareBody.shareLink.utm.utm_source, 'share');

    // deactivate
    const off = await req(base, `/api/admin/tracking/share-links/${shareLink.id}`, {
      method: 'PATCH', body: JSON.stringify({ active: false }),
    });
    assert.equal((await off.json()).shareLink.active, 0);

    const audit = db.prepare("SELECT action FROM audit_logs WHERE action = 'share_link_created'").all();
    assert.equal(audit.length, 3, 'share-link creation audited');
  });
});

test('TR15. delivery retry endpoint re-attempts a failed webhook', async () => {
  const db = seededDb();
  let hookStatus = 500;
  const hook = http.createServer((rq, rs) => {
    rq.on('data', () => {});
    rq.on('end', () => {
      rs.writeHead(hookStatus, { 'Content-Type': 'application/json' });
      rs.end(hookStatus === 200 ? '{"ok":true}' : '{"error":"boom"}');
    });
  });
  const hookPort = await new Promise((resolve) => { hook.listen(0, '127.0.0.1', () => resolve(hook.address().port)); });
  const url = `http://127.0.0.1:${hookPort}/hook`;
  process.env.LEAD_WEBHOOK_URL = url;
  try {
    await withApi(db, async (base) => {
      const created = await req(base, '/api/track/lead', {
        method: 'POST',
        body: JSON.stringify({ name: 'Retry Lead', email: 'retry@corp.com', rendered_at: Date.now() - 5000 }),
      });
      const { id } = await created.json();
      const delivery = db.prepare('SELECT * FROM lead_deliveries WHERE lead_id = ?').get(id);
      assert.ok(delivery);

      // let the initial (failing) attempt settle
      let failed = null;
      for (let i = 0; i < 40 && !failed; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        failed = db.prepare("SELECT * FROM lead_deliveries WHERE id = ? AND status = 'failed'").get(delivery.id);
      }
      assert.ok(failed, 'initial attempt marked failed');
      assert.ok(failed.last_error.includes('500'));

      hookStatus = 200;
      const retry = await req(base, `/api/admin/tracking/deliveries/${delivery.id}/retry`, { method: 'POST' });
      assert.equal(retry.status, 200);
      const body = await retry.json();
      assert.equal(body.delivery.status, 'sent');
      assert.equal(body.delivery.attempts, 2);
      assert.equal(body.delivery.last_error, null);
    });
  } finally {
    delete process.env.LEAD_WEBHOOK_URL;
    await new Promise((r) => hook.close(r));
  }
});
