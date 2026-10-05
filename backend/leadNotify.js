// Lead delivery: generic webhook outbox + optional SMTP email.
// Rows are written to `lead_deliveries`; attempts are recorded so the
// dashboard can retry. Nothing here throws into the request path.
const tls = require('tls');
const db = require('./database');

function webhookUrl() {
  const u = process.env.LEAD_WEBHOOK_URL;
  return u && /^https?:\/\//.test(u) ? u : null;
}

function emailConfig() {
  const to = process.env.LEAD_NOTIFY_EMAIL;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!to || !host || !user || !pass) return null;
  return {
    to,
    host,
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    user,
    pass,
    from: process.env.SMTP_FROM || user,
  };
}

function leadPayload(lead) {
  return {
    type: 'lead.created',
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      company: lead.company,
      phone: lead.phone,
      interest: lead.interest,
      message: lead.message,
      status: lead.status,
      source_path: lead.source_path,
      created_at: lead.created_at,
      attribution: lead.attribution ? safeParse(lead.attribution) : null,
    },
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// Insert pending delivery rows for a lead (webhook + email when configured).
function enqueueDeliveries(leadId) {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    if (!lead) return [];
    const ids = [];
    const wh = webhookUrl();
    if (wh) {
      const r = db.prepare('INSERT INTO lead_deliveries (lead_id, channel, target) VALUES (?, ?, ?)')
        .run(leadId, 'webhook', wh);
      ids.push(Number(r.lastInsertRowid));
    }
    const mail = emailConfig();
    if (mail) {
      const r = db.prepare('INSERT INTO lead_deliveries (lead_id, channel, target) VALUES (?, ?, ?)')
        .run(leadId, 'email', mail.to);
      ids.push(Number(r.lastInsertRowid));
    }
    return ids;
  } catch (e) {
    console.error('[leadNotify] enqueue failed:', e.message);
    return [];
  }
}

async function postWebhook(url, payload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
    return;
  } finally {
    clearTimeout(t);
  }
}

// Minimal implicit-TLS (port 465) SMTP client — no external dependency.
// Supports AUTH LOGIN. Enough for transactional notification emails.
function smtpSend({ host, port, user, pass, from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    const script = [
      `EHLO lead.local`,
      `AUTH LOGIN`,
      Buffer.from(user, 'utf8').toString('base64'),
      Buffer.from(pass, 'utf8').toString('base64'),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      'DATA',
      [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        text.replace(/\r?\n/g, '\r\n'),
        '.',
      ].join('\r\n'),
      'QUIT',
    ];
    let step = 0;
    let buf = '';
    let settled = false;
    const socket = tls.connect({ host, port, servername: host }, () => {});
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      if (err) reject(err); else resolve();
    };
    const deadline = setTimeout(() => finish(new Error('SMTP timeout')), 20000);
    socket.setTimeout(20000);
    socket.on('timeout', () => finish(new Error('SMTP socket timeout')));
    socket.on('error', (e) => finish(e));
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      // A reply ends with "<code><space>..." (dashed continuations end with "-").
      if (!/\d{3}[ ]/.test(buf)) return;
      const code = parseInt(buf.slice(0, 3), 10);
      buf = '';
      if (code >= 400) return finish(new Error(`SMTP ${code}`));
      if (step >= script.length) return finish();
      socket.write(`${script[step]}\r\n`);
      step += 1;
    });
  });
}

async function sendEmail(cfg, lead) {
  const body = [
    'New lead captured on HUMSEE SCORE.',
    '',
    `Name    : ${lead.name}`,
    `Email   : ${lead.email}`,
    `Company : ${lead.company || '-'}`,
    `Phone   : ${lead.phone || '-'}`,
    `Interest: ${lead.interest || '-'}`,
    `Status  : ${lead.status}`,
    `Source  : ${lead.source_path || '-'}`,
    `At time : ${lead.created_at}`,
    '',
    'Message:',
    lead.message || '-',
    '',
    'Attribution:',
    JSON.stringify(safeParse(lead.attribution) || {}, null, 2),
  ].join('\n');
  await smtpSend({ ...cfg, subject: `[HUMSEE SCORE] New lead: ${lead.name} (${lead.email})`, text: body });
}

// Attempt one delivery row. Never throws — errors land in last_error.
async function attemptDelivery(deliveryId) {
  const row = db.prepare('SELECT * FROM lead_deliveries WHERE id = ?').get(deliveryId);
  if (!row) return null;
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(row.lead_id);
  if (!lead) return null;
  let error = null;
  try {
    if (row.channel === 'webhook') {
      await postWebhook(row.target || webhookUrl(), leadPayload(lead));
    } else if (row.channel === 'email') {
      const cfg = emailConfig();
      if (!cfg) throw new Error('SMTP is not configured');
      await sendEmail(cfg, lead);
    } else {
      throw new Error(`unknown channel ${row.channel}`);
    }
  } catch (e) {
    error = String((e && e.message) || e).slice(0, 300);
  }
  try {
    if (error) {
      db.prepare(`UPDATE lead_deliveries SET attempts = attempts + 1, last_error = ?, status = 'failed' WHERE id = ?`)
        .run(error, deliveryId);
    } else {
      db.prepare(`UPDATE lead_deliveries SET attempts = attempts + 1, last_error = NULL, status = 'sent', sent_at = datetime('now') WHERE id = ?`)
        .run(deliveryId);
    }
  } catch (e) {
    console.error('[leadNotify] update failed:', e.message);
  }
  return db.prepare('SELECT * FROM lead_deliveries WHERE id = ?').get(deliveryId);
}

// Fire-and-forget attempts for all pending rows of a lead.
function deliverLeadAsync(leadId) {
  try {
    const rows = db.prepare(`SELECT id FROM lead_deliveries WHERE lead_id = ? AND status = 'pending'`).all(leadId);
    rows.forEach((r) => { attemptDelivery(r.id).catch(() => {}); });
  } catch (e) {
    console.error('[leadNotify] async delivery failed:', e.message);
  }
}

module.exports = { enqueueDeliveries, attemptDelivery, deliverLeadAsync, webhookUrl, emailConfig, leadPayload };
