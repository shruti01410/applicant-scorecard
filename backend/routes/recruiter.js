const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// Consolidated recruiter account view for the navbar/profile popover.
router.get('/recruiter/profile', (req, res) => {
  const profile = db.prepare(`
    SELECT firebase_uid, email AS google_email, google_account_connected, gmail_authorized, photo_url, created_at, updated_at
    FROM recruiter_profiles WHERE user_id = ?
  `).get(req.user.id);
  const recruiter = db.prepare('SELECT id, name, email, username FROM users WHERE id = ?').get(req.user.id);
  const conn = db.prepare('SELECT account_email FROM gmail_connections WHERE user_id = ?').get(req.user.id);

  if (conn && profile && !profile.gmail_authorized) {
    db.prepare("UPDATE recruiter_profiles SET gmail_authorized = 1, updated_at = datetime('now') WHERE user_id = ?").run(req.user.id);
  }

  res.json({
    recruiter,
    google: profile || null,
    gmail: {
      configured: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET),
      connected: !!conn,
      account: conn ? conn.account_email : null,
      authorized: !!(profile && profile.gmail_authorized),
    },
  });
});

module.exports = router;