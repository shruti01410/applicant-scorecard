const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let cachedSecret = null;

// Prefer JWT_SECRET env. Otherwise persist a strong random secret on the
// Railway volume (/data) so tokens survive restarts without a known default.
function jwtSecret() {
  if (cachedSecret) return cachedSecret;
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 16) {
    if (env === 'scorecard-secret-key' || env === 'dev-secret') {
      console.warn('[security] Weak JWT_SECRET in use — replace with a long random value.');
    }
    cachedSecret = env;
    return cachedSecret;
  }
  const candidates = [
    process.env.JWT_SECRET_FILE,
    process.env.RAILWAY_VOLUME_PATH ? path.join(process.env.RAILWAY_VOLUME_PATH, '.jwt-secret') : null,
    '/data/.jwt-secret',
    path.join(__dirname, '.jwt-secret'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const existing = fs.readFileSync(file, 'utf8').trim();
        if (existing.length >= 32) {
          cachedSecret = existing;
          return cachedSecret;
        }
      }
      const generated = crypto.randomBytes(48).toString('hex');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, generated, { mode: 0o600 });
      console.log(`[security] Generated JWT secret at ${file}`);
      cachedSecret = generated;
      return cachedSecret;
    } catch (e) {
      // try next candidate
    }
  }
  cachedSecret = 'scorecard-secret-key';
  console.warn('[security] JWT_SECRET not set and no writable secret file — using insecure default.');
  return cachedSecret;
}

// Fixed-window in-memory rate limiter (single-process app).
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many requests. Please try again later.' } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const now = Date.now();
    let stamps = hits.get(key) || [];
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= max) {
      return res.status(429).json({ error: message });
    }
    stamps.push(now);
    hits.set(key, stamps);
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    next();
  };
}

function allowedOrigins() {
  const raw = process.env.CORS_ORIGINS
    || 'https://www.humsee.works,https://humsee.works,http://localhost:3000,http://127.0.0.1:3000';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Seed / default passwords. Prefer env (set on Railway); local fallback is
// intentionally stronger than the old demo "12345" but still for dev only.
function defaultAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'Humsee!Admin_2026';
}

function defaultEmployeePassword() {
  return process.env.EMPLOYEE_PASSWORD || 'Humsee!Employee_2026';
}

// Weak plaintext passwords that must never remain in the DB after first boot.
const WEAK_PASSWORDS = ['12345', 'rishasinha', 'password', 'admin', 'test123'];

function isWeakPassword(hash) {
  if (!hash) return false;
  for (const weak of WEAK_PASSWORDS) {
    try {
      if (require('bcryptjs').compareSync(weak, hash)) return true;
    } catch (e) { /* not a bcrypt hash */ }
  }
  return false;
}

module.exports = {
  jwtSecret,
  rateLimit,
  allowedOrigins,
  defaultAdminPassword,
  defaultEmployeePassword,
  isWeakPassword,
  WEAK_PASSWORDS,
};
