let cachedAuth = null;

function firebaseConfig() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try { return { kind: 'cert', sa: JSON.parse(raw) }; } catch (e) { return null; }
  }
  const pid = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (pid && clientEmail && privateKey) return { kind: 'cert', sa: { project_id: pid, client_email: clientEmail, private_key: privateKey } };
  if (pid) return { kind: 'project', sa: { project_id: pid } };
  return null;
}

function isFirebaseConfigured() {
  return !!firebaseConfig();
}

// Web SDK config served to the frontend at runtime (Railway build-time vars
// are not reliably inlined by the Vite build, so the UI fetches this instead).
function webConfig() {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || '';
  const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || '';
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '';
  const appId = process.env.VITE_FIREBASE_APP_ID || '';
  return {
    enabled: !!(apiKey && authDomain && projectId && appId),
    apiKey,
    authDomain,
    projectId,
    appId,
  };
}

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const cfg = firebaseConfig();
  if (!cfg) return null;
  const { initializeApp, getApps, deleteApp } = require('firebase-admin/app');
  const apps = getApps();
  if (apps.length === 0) {
    if (cfg.kind === 'cert') {
      const { cert } = require('firebase-admin/credential');
      initializeApp({ credential: cert(cfg.sa) });
    } else {
      initializeApp({ projectId: cfg.sa.project_id });
    }
  } else if (apps[0].options.projectId !== cfg.sa.project_id) {
    // Reuse path (previous config mode may have created the default app)
    deleteApp(apps[0]);
    if (cfg.kind === 'cert') {
      const { cert } = require('firebase-admin/credential');
      initializeApp({ credential: cert(cfg.sa) });
    } else {
      initializeApp({ projectId: cfg.sa.project_id });
    }
  }
  cachedAuth = require('firebase-admin/auth').getAuth();
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

module.exports = { isFirebaseConfigured, verifyGoogleIdToken, webConfig };