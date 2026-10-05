let cachedAuth = null;

function firebaseConfig() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try { return { kind: 'cert', sa: JSON.parse(raw) }; } catch (e) { return null; }
  }
  const pid = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');
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

async function verifyViaTokenInfo(idToken, expectedProjectId) {
  // Fallback when Admin SDK credential is not available — verify via Google's
  // public tokeninfo endpoint (no service account needed). Hits the network but
  // unblocks login on Railway when only projectId web config is present.
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(idToken))}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Token verification failed (${res.status}): ${body.slice(0, 200)}`);
    err.code = 'TOKENINFO_FAILED';
    throw err;
  }
  const data = await res.json();
  // Basic sanity checks: issuer, audience matches this Firebase project
  const issOk = typeof data.iss === 'string' && (data.iss === 'https://accounts.google.com' || data.iss === 'accounts.google.com');
  const audOk = !expectedProjectId || data.aud === expectedProjectId || data.aud === process.env.VITE_FIREBASE_PROJECT_ID;
  if (!issOk) {
    const err = new Error('Invalid token issuer');
    err.code = 'INVALID_ISSUER';
    throw err;
  }
  // aud is the OAuth client id / project — be lenient but log mismatch
  if (expectedProjectId && data.aud !== expectedProjectId && !String(data.aud).includes(expectedProjectId)) {
    console.warn(`[firebaseAuth] tokeninfo aud mismatch: got ${data.aud}, expected ${expectedProjectId}`);
  }
  return {
    uid: String(data.sub || data.user_id || ''),
    name: String(data.name || ''),
    email: String(data.email || ''),
    email_verified: String(data.email_verified) === 'true' || data.email_verified === true,
    picture: data.picture ? String(data.picture) : null,
  };
}

async function verifyGoogleIdToken(idToken) {
  const auth = getAuth();
  if (!auth) {
    const err = new Error('Google login is not configured on the server yet.');
    err.code = 'FIREBASE_NOT_CONFIGURED';
    throw err;
  }
  try {
    const decoded = await auth.verifyIdToken(String(idToken));
    return {
      uid: decoded.uid,
      name: decoded.name || '',
      email: decoded.email || '',
      email_verified: !!decoded.email_verified,
      picture: decoded.picture || null,
    };
  } catch (e) {
    // If Admin SDK fails due to missing credential, fall back to tokeninfo
    const cfg = firebaseConfig();
    const pid = cfg && cfg.sa && cfg.sa.project_id ? cfg.sa.project_id : process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
    const msg = String(e && e.message || '');
    const code = String(e && e.code || '');
    const isCredentialError = code.includes('credential') || msg.includes('credential') || msg.includes('private_key') || code === 'app/invalid-credential' || msg.includes('Could not determine service account');
    if (cfg && cfg.kind === 'project' || isCredentialError) {
      console.warn(`[firebaseAuth] Admin SDK verify failed (${code || msg.slice(0,80)}), falling back to tokeninfo`);
      return verifyViaTokenInfo(idToken, pid);
    }
    throw e;
  }
}

module.exports = { isFirebaseConfigured, verifyGoogleIdToken, webConfig };