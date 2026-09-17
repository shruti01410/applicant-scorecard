let cachedAuth = null;

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  const pid = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (pid && clientEmail && privateKey) return { project_id: pid, client_email: clientEmail, private_key: privateKey };
  return null;
}

function isFirebaseConfigured() {
  return !!serviceAccount();
}

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const sa = serviceAccount();
  if (!sa) return null;
  const admin = require('firebase-admin');
  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  cachedAuth = admin.auth();
  return cachedAuth;
}

async function verifyGoogleIdToken(idToken) {
  const auth = getAuth();
  if (!auth) {
    const err = new Error('Google login is not configured on the server yet.');
    err.code = 'FIREBASE_NOT_CONFIGURED';
    throw err;
  }
  const decoded = await auth.verifyIdToken(String(idToken), true);
  return {
    uid: decoded.uid,
    name: decoded.name || '',
    email: decoded.email || '',
    email_verified: !!decoded.email_verified,
    picture: decoded.picture || null,
  };
}

module.exports = { isFirebaseConfigured, verifyGoogleIdToken };