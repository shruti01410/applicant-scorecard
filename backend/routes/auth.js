const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { makeUsername } = require('../database');
const { users } = require('../repositories');
const { isFirebaseConfigured, verifyGoogleIdToken, webConfig } = require('../firebaseAuth');
const { jwtSecret, rateLimit } = require('../security');
const { logLogin, logActivity } = require('../analyticsDb');
const { logAudit } = require('../audit');

const router = express.Router();
const JWT_SECRET = jwtSecret();

function signToken(user) {
  // organization_id keeps every session bound to the tenant the user belongs
  // to. status lets suspended accounts be revoked immediately on next login.
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, organization_id: user.organization_id ?? null, status: user.status ?? 'active' },
    JWT_SECRET,
    { expiresIn: '1d' }
  );
}

function touchLastLogin(userId) {
  try {
    db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(userId);
  } catch (e) {}
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
});
const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

// Public Firebase web SDK config for the login screen. Read at runtime so the
// frontend does not depend on build-time inlining of VITE_* variables.
router.get('/firebase-config', (req, res) => {
  res.json(webConfig());
});

router.post('/login', loginLimiter, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = users.findByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    logAudit({ action: 'login_failed', targetType: 'user', detail: { username }, req });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.status === 'suspended') {
    logAudit({ performedBy: user.id, action: 'login_blocked_suspended', targetType: 'user', targetId: user.id, req });
    return res.status(403).json({ error: 'This account has been suspended. Contact an administrator.' });
  }

  touchLastLogin(user.id);
  logAudit({ performedBy: user.id, action: 'login', targetType: 'user', targetId: user.id, req });

  const token = signToken(user);

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, name: user.name, email: user.email, organization_id: user.organization_id ?? null }
  });
});

function issueToken(user) {
  return signToken(user);
}

// Continue with Google (Firebase). The Google ID token is verified here with
// the Firebase Admin SDK — the frontend's UID/email are never trusted.
router.post('/google', googleLimiter, async (req, res) => {
  if (!isFirebaseConfigured()) {
    return res.status(503).json({
      error: 'Google login is not configured yet. An administrator needs to add the Firebase service account credentials.',
    });
  }
  const idToken = String(req.body.idToken || '').trim();
  if (!idToken) return res.status(400).json({ error: 'idToken is required' });

  let googleUser;
  try {
    googleUser = await verifyGoogleIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' });
  }
  if (!googleUser.email || !googleUser.email_verified) {
    return res.status(401).json({ error: 'This Google account has no verified email. Use an account with a verified email address.' });
  }

  // Authorization: a verified Google email is allowed only when it is on the
  // ADMIN_ALLOWED_EMAILS allowlist (comma-separated). When the variable is unset
  // the open behavior is kept for backward compatibility, but it logs a warning
  // so the gap stays visible. Non-allowed emails are rejected with 403.
  const allowedEmails = (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.length > 0) {
    if (!allowedEmails.includes(googleUser.email.toLowerCase())) {
      return res.status(403).json({
        error: 'Your Google account is not on the allowed list. Contact an administrator.',
      });
    }
  } else {
    console.warn('[auth] ADMIN_ALLOWED_EMAILS is not set — every verified Google email is treated as an admin.');
  }

  let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(googleUser.email);
  let defaultOrg = null;
  try { defaultOrg = db.prepare("SELECT id FROM organizations WHERE slug = 'humsee'").get(); } catch (e) {}
  const orgId = defaultOrg ? defaultOrg.id : null;

  if (!user) {
    const username = makeUsername(googleUser.name || googleUser.email.split('@')[0] || 'recruiter');
    const password = bcrypt.hashSync(Math.random().toString(36).slice(2) + Date.now().toString(36), 10);
    const inserted = db.prepare('INSERT INTO users (username, password, role, name, email, auth_provider, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(username, password, 'admin', googleUser.name || googleUser.email, googleUser.email, 'google', orgId);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(inserted.lastInsertRowid);
    logAudit({ performedBy: user.id, action: 'google_signup', targetType: 'user', targetId: user.id, detail: { email: googleUser.email }, req });
  } else if (user.role !== 'admin') {
    db.prepare('UPDATE users SET role = ?, email = ?, auth_provider = ? WHERE id = ?').run('admin', googleUser.email, 'google', user.id);
    user.role = 'admin';
    user.email = googleUser.email;
    logAudit({ performedBy: user.id, action: 'google_promote_admin', targetType: 'user', targetId: user.id, req });
  }

  try {
    db.prepare('UPDATE users SET organization_id = COALESCE(organization_id, ?) WHERE id = ?').run(orgId, user.id);
    user.organization_id = user.organization_id ?? orgId;
  } catch (e) {}
  touchLastLogin(user.id);

  const existingProfile = db.prepare('SELECT id, firebase_uid FROM recruiter_profiles WHERE user_id = ?').get(user.id);
  if (existingProfile && existingProfile.firebase_uid !== googleUser.uid) {
    db.prepare('DELETE FROM recruiter_profiles WHERE user_id = ?').run(user.id);
  }

  db.prepare(`
    INSERT INTO recruiter_profiles (firebase_uid, user_id, name, email, photo_url, google_account_connected, gmail_authorized, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'))
    ON CONFLICT(firebase_uid) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      email = excluded.email,
      photo_url = excluded.photo_url,
      google_account_connected = 1,
      updated_at = datetime('now')
  `).run(googleUser.uid, user.id, googleUser.name || user.name, googleUser.email, googleUser.picture || null);

  const connected = db.prepare('SELECT 1 FROM gmail_connections WHERE user_id = ?').get(user.id);
  if (connected) {
    db.prepare('UPDATE recruiter_profiles SET gmail_authorized = 1, updated_at = datetime(\'now\') WHERE user_id = ?').run(user.id);
  }

  const profile = db.prepare(`
    SELECT firebase_uid, email AS google_email, google_account_connected, gmail_authorized, photo_url
    FROM recruiter_profiles WHERE user_id = ?
  `).get(user.id);

  res.json({
    token: issueToken(user),
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: googleUser.name || user.name,
      email: googleUser.email,
      organization_id: user.organization_id ?? null,
      login_method: 'google',
      google_email: profile.google_email,
      firebase_uid: profile.firebase_uid,
      gmail_authorized: profile.gmail_authorized,
      photo_url: profile.photo_url,
    },
  });
});

module.exports = router;