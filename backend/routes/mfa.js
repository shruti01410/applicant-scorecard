const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../security');
const { logAudit } = require('../audit');
const { generateSecret, verify: verifyTotp, otpauthURI } = require('../mfa');

const router = express.Router();

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many MFA attempts. Please wait 15 minutes and try again.',
});

// Ensure MFA columns exist (idempotent).
try {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
  if (!cols.includes('mfa_enabled')) db.exec("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes('mfa_secret')) db.exec('ALTER TABLE users ADD COLUMN mfa_secret TEXT');
} catch (e) {}

// POST /api/auth/mfa/setup — generate a pending secret (not active until verify).
router.post('/setup', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, name, mfa_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.mfa_enabled) return res.status(400).json({ error: 'MFA is already enabled. Disable it first to re-setup.' });

  const secret = generateSecret();
  db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(secret, user.id);
  const account = user.email || user.username;
  res.json({
    secret,
    otpauth_url: otpauthURI(secret, account),
    account,
  });
});

// POST /api/auth/mfa/verify — confirm first code, activate MFA.
router.post('/verify', authenticate, mfaLimiter, (req, res) => {
  const code = String(req.body.code || '').trim();
  const user = db.prepare('SELECT id, username, mfa_enabled, mfa_secret FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.mfa_enabled) return res.status(400).json({ error: 'MFA is already enabled.' });
  if (!user.mfa_secret) return res.status(400).json({ error: 'Run MFA setup first.' });
  if (!verifyTotp(user.mfa_secret, code)) {
    logAudit({ performedBy: user.id, action: 'mfa_verify_failed', targetType: 'user', targetId: user.id, req });
    return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
  }
  db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(user.id);
  logAudit({ performedBy: user.id, action: 'mfa_enabled', targetType: 'user', targetId: user.id, req, module: 'security' });
  res.json({ ok: true, mfa_enabled: true });
});

// POST /api/auth/mfa/disable — require password + current code.
router.post('/disable', authenticate, mfaLimiter, (req, res) => {
  const password = String(req.body.password || '');
  const code = String(req.body.code || '').trim();
  const user = db.prepare('SELECT id, username, password, mfa_enabled, mfa_secret FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.mfa_enabled) return res.status(400).json({ error: 'MFA is not enabled.' });
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  if (!verifyTotp(user.mfa_secret, code)) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?').run(user.id);
  logAudit({ performedBy: user.id, action: 'mfa_disabled', targetType: 'user', targetId: user.id, req, module: 'security' });
  res.json({ ok: true, mfa_enabled: false });
});

// GET /api/auth/mfa/status — for the account UI.
router.get('/status', authenticate, (req, res) => {
  const user = db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(req.user.id);
  res.json({ mfa_enabled: !!(user && user.mfa_enabled) });
});

module.exports = router;
