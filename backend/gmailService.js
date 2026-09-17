const crypto = require('crypto');
const db = require('./database');

const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function getConfig() {
  return {
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    tokenKey: process.env.GMAIL_TOKEN_KEY || process.env.JWT_SECRET || 'dev-secret',
    stateSecret: process.env.GMAIL_STATE_SECRET || process.env.JWT_SECRET || 'dev-secret',
  };
}

function isConfigured(cfg = getConfig()) {
  return Boolean(cfg.clientId && cfg.clientSecret);
}

// ---- Token encryption at rest (never stored in clear) ----
function tokenKey(cfg = getConfig()) {
  return crypto.createHash('sha256').update(String(cfg.tokenKey)).digest();
}

function encryptToken(value, cfg = getConfig()) {
  if (value == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(cfg), iv);
  const enc = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptToken(value, cfg = getConfig()) {
  if (value == null) return null;
  if (!String(value).startsWith('v1:')) return String(value);
  const [, ivB64, tagB64, dataB64] = String(value).split(':');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(cfg), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

// ---- OAuth state signing (CSRF protection) ----
function signState(payload, cfg = getConfig()) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', String(cfg.stateSecret)).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyState(value, cfg = getConfig()) {
  if (!value) return null;
  try {
    const [data, sig] = String(value).split('.');
    const expected = crypto.createHmac('sha256', String(cfg.stateSecret)).update(data).digest('base64url');
    const ok = expected.length === String(sig || '').length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    if (!ok) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.uid || Math.abs(Date.now() - Number(payload.ts || 0)) > 10 * 60 * 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ---- Email helpers ----
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function encodeRFC2047(value) {
  if (/^[\x00-\x7F]*$/.test(String(value))) return String(value);
  return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function buildMimeMessage({ to, from, subject, body }) {
  return [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${encodeRFC2047(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ].join('\r\n');
}

function toBase64Url(text) {
  return Buffer.from(String(text), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value) {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function authorizationUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_COMPOSE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${p.toString()}`;
}

function gmailDraftUrl(messageId) {
  return `https://mail.google.com/mail/u/0/#inbox?compose=${encodeURIComponent(messageId)}`;
}

function expiresAtString(expiresInSeconds) {
  const secs = Number(expiresInSeconds || 3600);
  return new Date(Date.now() + secs * 1000).toISOString();
}

// ---- Connection persistence ----
function storeConnection({ userId, accountEmail, accessToken, refreshToken, scopes, expiresAt, cfg = getConfig() }) {
  db.prepare(`
    INSERT INTO gmail_connections (user_id, account_email, access_token, refresh_token, scopes, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      account_email = excluded.account_email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(
    userId,
    accountEmail,
    encryptToken(accessToken, cfg),
    encryptToken(refreshToken, cfg),
    scopes || '',
    expiresAt || expiresAtString(3600)
  );
}

function getConnection(userId) {
  return db.prepare('SELECT * FROM gmail_connections WHERE user_id = ?').get(userId);
}

function deleteConnection(userId) {
  db.prepare('DELETE FROM gmail_connections WHERE user_id = ?').run(userId);
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + 60 * 1000;
}

// ---- Google OAuth HTTP calls (native fetch, no extra deps) ----
async function exchangeCode({ code, redirectUri, cfg }) {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const details = await res.text();
    const err = new Error('Google authorization failed');
    err.code = 'OAUTH_EXCHANGE_FAILED';
    err.details = details;
    throw err;
  }
  return res.json();
}

async function refreshAccessToken(refreshToken, cfg) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const details = await res.text();
    const err = new Error('Failed to refresh your Gmail access token');
    err.code = 'TOKEN_REFRESH_FAILED';
    err.details = details;
    throw err;
  }
  return res.json();
}

async function fetchGmailProfile(accessToken) {
  const res = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = new Error('Failed to read the connected Gmail account');
    err.code = 'GMAIL_API_ERROR';
    err.status = res.status;
    err.details = await res.text();
    throw err;
  }
  return res.json();
}

async function createGmailDraft({ accessToken, message }) {
  const res = await fetch(`${GMAIL_API}/drafts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw: toBase64Url(message) } }),
  });
  if (!res.ok) {
    const details = await res.text();
    const err = new Error('Gmail could not create the draft');
    err.code = 'GMAIL_API_ERROR';
    err.status = res.status;
    err.details = details;
    throw err;
  }
  return res.json();
}

async function getValidAccessToken(userId) {
  const conn = getConnection(userId);
  if (!conn) {
    const err = new Error('Gmail account is not connected. Connect your Gmail account to save drafts.');
    err.code = 'GMAIL_NOT_CONNECTED';
    throw err;
  }
  const cfg = getConfig();
  if (!isConfigured(cfg)) {
    const err = new Error('Gmail integration is not configured on the server.');
    err.code = 'GMAIL_NOT_CONFIGURED';
    throw err;
  }
  let accessToken = decryptToken(conn.access_token, cfg);
  if (!accessToken) {
    const err = new Error('The connected Gmail account token could not be read. Please disconnect and reconnect your Gmail account.');
    err.code = 'GMAIL_TOKEN_INVALID';
    throw err;
  }
  const refreshToken = decryptToken(conn.refresh_token, cfg);
  if (refreshToken && isTokenExpired(conn.expires_at)) {
    const tok = await refreshAccessToken(refreshToken, cfg);
    accessToken = tok.access_token;
    db.prepare(
      `UPDATE gmail_connections SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = datetime('now') WHERE user_id = ?`
    ).run(encryptToken(tok.access_token, cfg), encryptToken(tok.refresh_token || refreshToken, cfg), expiresAtString(tok.expires_in), userId);
  }
  return accessToken;
}

// Errors are mapped to structured codes so routes can show friendly messages.
function friendlyError(e, fallback) {
  if (e && e.code) return e;
  const err = new Error(fallback || 'Something went wrong while connecting to Gmail. Please try again.');
  err.code = 'GMAIL_UNKNOWN';
  return err;
}

module.exports = {
  GMAIL_COMPOSE_SCOPE,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GMAIL_API,
  getConfig,
  isConfigured,
  encryptToken,
  decryptToken,
  signState,
  verifyState,
  isValidEmail,
  encodeRFC2047,
  buildMimeMessage,
  toBase64Url,
  fromBase64Url,
  authorizationUrl,
  gmailDraftUrl,
  expiresAtString,
  storeConnection,
  getConnection,
  deleteConnection,
  isTokenExpired,
  exchangeCode,
  refreshAccessToken,
  fetchGmailProfile,
  createGmailDraft,
  getValidAccessToken,
  friendlyError,
};