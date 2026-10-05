// Invisible app-wide visitor tracking. One init line in main.jsx; no UI.
// Public endpoints only (/api/track/*) — plain fetch, never the authed api wrapper.
const BASE_URL = import.meta.env.VITE_API_URL || '';

const LS_VISITOR = 'hvs_vid';
const SS_SESSION = 'hvs_sid';
const SS_ACTIVITY = 'hvs_activity';
const LS_FIRST = 'hvs_first';
const LS_LAST = 'hvs_last';

const SESSION_IDLE_MS = 30 * 60 * 1000;
const FLUSH_MS = 5000;
const FLUSH_MAX = 10;

const ATTR_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'msclkid', 'li_fat_id', 'fbclid', 'ttclid', 'src', 'ref', 'campaign', 'sl',
];

let queue = [];
let flushTimer = null;
let inited = false;
let lastPath = null;

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  // RFC4122-ish fallback for very old browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getVisitorId() {
  try {
    let id = localStorage.getItem(LS_VISITOR);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = uuid();
      localStorage.setItem(LS_VISITOR, id);
    }
    return id;
  } catch (e) {
    return uuid();
  }
}

function getSessionId() {
  try {
    const now = Date.now();
    let sid = sessionStorage.getItem(SS_SESSION);
    const activity = Number(sessionStorage.getItem(SS_ACTIVITY) || 0);
    if (!sid || now - activity > SESSION_IDLE_MS) {
      sid = uuid();
      sessionStorage.setItem(SS_SESSION, sid);
    }
    sessionStorage.setItem(SS_ACTIVITY, String(now));
    return sid;
  } catch (e) {
    return uuid();
  }
}

function attrFromSearch(search) {
  const out = {};
  try {
    const params = new URLSearchParams(search || '');
    for (const k of ATTR_KEYS) {
      const v = params.get(k);
      if (v && v.trim()) out[k] = v.trim().slice(0, 200);
    }
  } catch (e) { /* ignore */ }
  return Object.keys(out).length ? out : null;
}

function attrFromReferrer() {
  try {
    const ref = document.referrer;
    if (!ref) return null;
    const host = new URL(ref).hostname;
    if (!host || host === location.hostname) return null;
    return { ref: host.slice(0, 200) };
  } catch (e) {
    return null;
  }
}

// First touch is written once and never overwritten (localStorage).
function captureFirstTouch() {
  try {
    if (localStorage.getItem(LS_FIRST)) return;
    const fromUrl = attrFromSearch(location.search);
    const fromRef = attrFromReferrer();
    const payload = fromUrl || fromRef || { direct: '1' };
    payload.landing = location.pathname;
    payload.landed_at = new Date().toISOString();
    if (fromRef && fromUrl) payload.ref = fromRef.ref;
    localStorage.setItem(LS_FIRST, JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

// Last touch updates on every attributed visit.
function captureLastTouch() {
  try {
    const fromUrl = attrFromSearch(location.search);
    const fromRef = attrFromReferrer();
    if (!fromUrl && !fromRef) return;
    const payload = { ...(fromUrl || {}), at: new Date().toISOString(), path: location.pathname };
    if (fromRef && fromUrl) payload.ref = fromRef.ref;
    localStorage.setItem(LS_LAST, JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function track(type, meta, path) {
  if (!inited) return;
  queue.push({
    type: String(type || '').slice(0, 40),
    path: String(path || location.pathname).slice(0, 300),
    title: String(document.title || '').slice(0, 200),
    meta: meta && typeof meta === 'object' ? meta : undefined,
  });
  if (queue.length >= FLUSH_MAX) flush(false);
  else scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(false);
  }, FLUSH_MS);
}

function flush(useBeacon) {
  if (!queue.length) return;
  const events = queue.splice(0, 20);
  const body = JSON.stringify({
    visitor_uuid: getVisitorId(),
    session_uuid: getSessionId(),
    first_params: readJson(LS_FIRST),
    last_params: readJson(LS_LAST) || readJson(LS_FIRST),
    landing_path: (readJson(LS_FIRST) || {}).landing || location.pathname,
    referrer: document.referrer || null,
    events,
  });
  // fetch(keepalive) first: it survives pagehide AND handles CORS preflight
  // (sendBeacon with a JSON blob cannot preflight in cross-origin dev).
  try {
    const p = fetch(`${BASE_URL}/api/track/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    if (p && p.catch) p.catch(() => {});
    return;
  } catch (e) {
    // fall through to beacon
  }
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${BASE_URL}/api/track/event`, new Blob([body], { type: 'application/json' }));
    }
  } catch (e) { /* tracking must never break the app */ }
}

function onRouteChange() {
  const path = location.pathname;
  if (path === lastPath) return;
  lastPath = path;
  captureFirstTouch();
  captureLastTouch();
  getSessionId(); // slides the idle window
  track('page_view', undefined, path);
}

export function initTracking() {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  try {
    captureFirstTouch();
    captureLastTouch();
    lastPath = location.pathname;
    track('page_view', undefined, location.pathname);

    // Patch history so SPA navigations emit page_view (popstate + pushState).
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      onRouteChange();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      onRouteChange();
      return r;
    };
    window.addEventListener('popstate', onRouteChange);

    window.addEventListener('pagehide', () => flush(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });
  } catch (e) { /* tracking must never break the app */ }
}

export function trackEvent(type, meta) {
  track(type, meta);
}

export function trackingContext() {
  return {
    visitor_uuid: getVisitorId(),
    session_uuid: getSessionId(),
    first_params: readJson(LS_FIRST),
    last_params: readJson(LS_LAST) || readJson(LS_FIRST),
    source_path: location.pathname,
    share_code: (attrFromSearch(location.search) || {}).sl || null,
  };
}

// Public lead submit — plain fetch (no auth, no 401 redirect side effects).
export async function submitLead(fields, renderedAt) {
  const ctx = trackingContext();
  const res = await fetch(`${BASE_URL}/api/track/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...fields,
      rendered_at: renderedAt,
      visitor_uuid: ctx.visitor_uuid,
      session_uuid: ctx.session_uuid,
      first_params: ctx.first_params,
      last_params: ctx.last_params,
      source_path: ctx.source_path,
      share_code: ctx.share_code,
      website: fields.website || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Submission failed. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}
