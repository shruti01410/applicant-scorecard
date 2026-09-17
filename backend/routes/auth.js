const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { isFirebaseConfigured, verifyGoogleIdToken, webConfig } = require('../firebaseAuth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'scorecard-secret-key';

// Public Firebase web SDK config for the login screen. Read at runtime so the
// frontend does not depend on build-time inlining of VITE_* variables.
router.get('/firebase-config', (req, res) => {
  res.json(webConfig());
});

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, name: user.name, email: user.email }
  });
});

function issueToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );
}

// Continue with Google (Firebase). The Google ID token is verified here with
// the Firebase Admin SDK — the frontend's UID/email are never trusted.
router.post('/google', async (req, res) => {
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

  // Authorization: the Google email must belong to an existing recruiter account.
  const user = db.prepare("SELECT * FROM users WHERE role = ? AND LOWER(email) = LOWER(?)").get('admin', googleUser.email);
  if (!user) {
    return res.status(403).json({ error: 'This Google account is not linked to a recruiter account in this application.' });
  }

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
      login_method: 'google',
      google_email: profile.google_email,
      firebase_uid: profile.firebase_uid,
      gmail_authorized: profile.gmail_authorized,
      photo_url: profile.photo_url,
    },
  });
});

module.exports = router;