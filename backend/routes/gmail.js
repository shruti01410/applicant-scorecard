const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const gmail = require('../gmailService');

const router = express.Router();

// Google redirects here after the recruiter consents. This route MUST be public
// (no JWT): Google's redirect carries no Authorization header, so protect it with
// the signed OAuth state + the short-lived auth code instead. Declared before the
// auth middleware below so it is not blocked.
router.get('/oauth/callback', async (req, res) => {
  const state = gmail.verifyState(req.query.state);
  const returnTo = state ? state.returnTo : '/decision-center';
  if (!state) {
    return res.redirect(`${returnTo}?gmail=invalid_state`);
  }
  if (req.query.error) {
    return res.redirect(`${returnTo}?gmail=denied`);
  }
  const cfg = gmail.getConfig();
  try {
    const tokens = await gmail.exchangeCode({ code: req.query.code, redirectUri: redirectUri(req), cfg });
    const profile = await gmail.fetchGmailProfile(tokens.access_token);
    gmail.storeConnection({
      userId: state.uid,
      accountEmail: profile.emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      scopes: tokens.scope || gmail.GMAIL_COMPOSE_SCOPE,
      expiresAt: gmail.expiresAtString(tokens.expires_in),
      cfg,
    });
    db.prepare(`UPDATE recruiter_profiles SET gmail_authorized = 1, google_account_connected = 1, updated_at = datetime('now') WHERE user_id = ?`).run(state.uid);
    res.redirect(`${returnTo}?gmail=connected`);
  } catch (e) {
    console.error('[gmail-callback] error:', e.code || e.name, e.message, (e.details || '').slice(0, 400));
    res.redirect(`${returnTo}?gmail=error`);
  }
});

router.use(authenticate, requireRole('admin'));

function getEmployee(id) {
  return db.prepare('SELECT id, name, email, job_description_id, resume_text FROM users WHERE id = ? AND role = ?').get(id, 'employee');
}

function redirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/admin/gmail/oauth/callback`;
}

function safeReturnTo(value) {
  const v = String(value || '/decision-center').replace(/[^a-zA-Z0-9_\-/]/g, '');
  return v.startsWith('/') ? v : '/decision-center';
}

// Connection status used by the UI (never returns tokens).
router.get('/status', (req, res) => {
  const conn = gmail.getConnection(req.user.id);
  if (conn) {
    db.prepare(`UPDATE recruiter_profiles SET gmail_authorized = 1, google_account_connected = 1, updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  }
  res.json({
    configured: gmail.isConfigured(),
    connected: !!conn,
    account: conn ? conn.account_email : null,
    scope: gmail.GMAIL_COMPOSE_SCOPE,
  });
});

// Kick off Google OAuth. Returns the authorization URL; the frontend redirects to it.
router.get('/connect', (req, res) => {
  const cfg = gmail.getConfig();
  if (!gmail.isConfigured(cfg)) {
    return res.status(503).json({
      error: 'Gmail has not been configured on the server yet. An administrator must set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET, then register the callback URL in Google Cloud Console.',
    });
  }
  const returnTo = safeReturnTo(req.query.return_to);
  const state = gmail.signState({ uid: req.user.id, ts: Date.now(), returnTo });
  res.json({
    authUrl: gmail.authorizationUrl({ clientId: cfg.clientId, redirectUri: redirectUri(req), state }),
  });
});

// Disconnect the recruiter's Gmail account.
router.post('/disconnect', (req, res) => {
  gmail.deleteConnection(req.user.id);
  db.prepare(`UPDATE recruiter_profiles SET gmail_authorized = 0, updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  res.json({ connected: false });
});

// Create the email as a real draft in the recruiter's Gmail (never auto-send).
router.post('/email-drafts/:id/gmail', async (req, res) => {
  const draft = db.prepare("SELECT * FROM candidate_emails WHERE id = ? AND status = 'draft'").get(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Email draft not found.' });

  if (draft.gmail_draft_id) {
    return res.status(409).json({
      error: 'This draft is already saved to Gmail. Open it in Gmail instead of creating a duplicate.',
      gmail_draft_url: gmail.gmailDraftUrl(draft.gmail_draft_id),
    });
  }

  const emp = getEmployee(draft.candidate_id);
  if (!emp) return res.status(404).json({ error: 'Candidate is no longer available.' });

  // The candidate's saved email is the single source of truth for the recipient.
  const recipient = String(draft.recipient_email || '').trim() || String(emp.email || '').trim();
  if (!recipient) {
    return res.status(400).json({ error: 'Candidate email is unavailable. Please add an email before creating the draft.' });
  }
  if (!gmail.isValidEmail(recipient)) {
    return res.status(400).json({ error: 'The candidate email address is not valid. Please update it before creating the draft.' });
  }
  if (!String(draft.subject || '').trim()) {
    return res.status(400).json({ error: 'Subject is required before creating the Gmail draft.' });
  }
  if (!String(draft.body || '').trim()) {
    return res.status(400).json({ error: 'Email body is required before creating the Gmail draft.' });
  }

  const conn = gmail.getConnection(req.user.id);
  let accessToken;
  try {
    accessToken = await gmail.getValidAccessToken(req.user.id);
  } catch (e) {
    const statusCode = e.code === 'GMAIL_NOT_CONFIGURED' ? 503 : 400;
    return res.status(statusCode).json({ error: e.message });
  }

  const message = gmail.buildMimeMessage({
    to: recipient,
    from: conn.account_email,
    subject: draft.subject,
    body: draft.body,
  });

  try {
    const created = await gmail.createGmailDraft({ accessToken, message });
    const draftId = created.id;
    const messageId = created.message && created.message.id;
    db.prepare(
      `UPDATE candidate_emails SET gmail_draft_id = ?, gmail_account_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(draftId, conn.id, draft.id);
    res.status(201).json({
      gmail_draft_id: draftId,
      to: recipient,
      gmail_account: conn.account_email,
      gmail_draft_url: messageId ? gmail.gmailDraftUrl(messageId) : null,
    });
  } catch (e) {
    let msg = 'Gmail could not create the draft. Please try again or check your Gmail connection.';
    if (e && e.status === 401) msg = 'Your Gmail session expired. Reconnect your Gmail account and try again.';
    if (e && e.status === 403) msg = 'Your Gmail account is not permitted to create drafts. Check the Gmail scope and try again.';
    res.status(502).json({ error: msg });
  }
});

module.exports = router;