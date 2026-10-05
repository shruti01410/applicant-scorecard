// Firebase Google login config.
// Intended to be resolved at RUNTIME from the backend (`/api/auth/firebase-config`)
// because VITE_* vars are not reliably inlined by the Railway Vite build. A
// build-time value is used first when present (local dev convenience).
let configCache = null;
let configPromise = null;

function buildTimeConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (apiKey && authDomain && projectId && appId) {
    return { apiKey, authDomain, projectId, appId };
  }
  return null;
}

export async function getFirebaseConfig() {
  if (configCache) return configCache;
  if (!configPromise) {
    configPromise = (async () => {
      const fromBuild = buildTimeConfig();
      if (fromBuild) {
        configCache = fromBuild;
        return configCache;
      }
      try {
        const res = await fetch('/api/auth/firebase-config');
        const cfg = await res.json();
        configCache = cfg.enabled ? cfg : null;
      } catch (e) {
        configCache = null;
      }
      return configCache;
    })();
  }
  return configPromise;
}

// Whether to render the "Continue with Google" button on the login screen.
export async function firebaseLoginAvailable() {
  const cfg = await getFirebaseConfig();
  return !!(cfg && cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

// Firebase Google sign-in returns the Google identity (UID, verified email).
// Gmail draft access is a SEPARATE OAuth permission, connected later in the
// app. Firebase alone never grants Gmail draft permission.
export async function signInWithGoogle() {
  const cfg = await getFirebaseConfig();
  if (!cfg) throw Object.assign(new Error('Google login is not configured.'), { code: 'unconfigured' });

  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

  let app;
  try {
    const existing = getApps();
    if (existing.length) {
      app = getApp();
      // ensure config matches — if projectId differs, re-init is not needed for same project
    } else {
      app = initializeApp(cfg);
    }
  } catch (e) {
    app = initializeApp(cfg);
  }
  const auth = getAuth(app);
  // Ensure auth uses current domain language
  auth.languageCode = 'en';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (e) {
    // Surface the raw Firebase error so friendlyFirebaseError can map it
    throw e;
  }
  const idToken = await result.user.getIdToken();
  return {
    idToken,
    displayName: result.user.displayName,
    email: result.user.email,
    photoURL: result.user.photoURL,
  };
}

// Translate known Firebase auth errors into a user-friendly message. Unknown
// codes pass the original message through unchanged.
export function friendlyFirebaseError(error) {
  const code = (error && (error.code || error.message)) || '';
  if (code === 'auth/unauthorized-domain') {
    return 'Google login is not enabled on this domain yet. Contact the administrator to add this domain to the Firebase Authorized domains list.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before signing in. Please try again.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Could not reach Google to sign you in. Check your internet connection and try again.';
  }
  return (error && error.message) || 'Google sign-in failed. Please try again.';
}