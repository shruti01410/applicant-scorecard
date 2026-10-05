// Visitor / lead tracking schema. All tables are ADDITIVE — no existing
// scorecard tables are touched. IPs are stored only as salted hashes.
const crypto = require('crypto');
const db = require('./database');
const { jwtSecret } = require('./security');

db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_uuid TEXT UNIQUE NOT NULL,
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    first_touch TEXT,
    last_touch TEXT,
    landing_path TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_hash TEXT,
    event_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS visitor_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT UNIQUE NOT NULL,
    visitor_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    page_views INTEGER DEFAULT 0,
    referrer TEXT
  );

  CREATE TABLE IF NOT EXISTS visitor_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id INTEGER,
    session_id INTEGER,
    share_link_id INTEGER,
    event_type TEXT NOT NULL,
    path TEXT,
    title TEXT,
    meta TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS share_links (
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

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id INTEGER,
    session_id INTEGER,
    share_link_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    interest TEXT,
    message TEXT,
    attribution TEXT,
    source_path TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','converted','closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS lead_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    channel TEXT NOT NULL DEFAULT 'webhook',
    target TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME
  );

  CREATE INDEX IF NOT EXISTS idx_events_visitor ON visitor_events(visitor_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_time ON visitor_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_type ON visitor_events(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON visitor_sessions(visitor_id);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
  CREATE INDEX IF NOT EXISTS idx_deliveries_lead ON lead_deliveries(lead_id);
`);

// Salted hash — raw IPs are never persisted.
function hashIp(ip) {
  if (!ip) return null;
  try {
    return crypto.createHash('sha256').update(`${jwtSecret()}|${ip}`).digest('hex').slice(0, 32);
  } catch (e) {
    return null;
  }
}

function genShareCode(len = 8) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function newShareCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = genShareCode();
    const taken = db.prepare('SELECT 1 FROM share_links WHERE code = ?').get(code);
    if (!taken) return code;
  }
  return genShareCode(12);
}

function retentionDays() {
  const n = parseInt(process.env.TRACKING_RETAIN_DAYS, 10);
  return Number.isFinite(n) && n > 0 ? n : 180;
}

// Best-effort retention prune (events only; leads are kept).
function pruneOld() {
  try {
    const d = retentionDays();
    db.exec(`DELETE FROM visitor_events WHERE created_at < datetime('now', '-${d} days')`);
    db.exec(`DELETE FROM visitor_sessions WHERE last_seen_at < datetime('now', '-${d} days')`);
  } catch (e) {
    // non-fatal
  }
}

try {
  pruneOld();
  const timer = setInterval(pruneOld, 24 * 60 * 60 * 1000);
  if (timer.unref) timer.unref();
} catch (e) {
  // non-fatal
}

module.exports = { hashIp, newShareCode, pruneOld, retentionDays };
