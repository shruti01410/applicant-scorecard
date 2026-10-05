const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');
const { allowedOrigins } = require('./security');
const { recordRequest, recordError } = require('./analyticsDb');
require('./database'); // initialise & seed DB on startup
require('./trackingDb'); // additive visitor/lead tracking tables

const app = express();
app.set('trust proxy', 1);

// Security headers. CSP off for now (Ant Design uses heavy inline styles).
// COOP must be disabled for Firebase signInWithPopup — same-origin isolates
// the popup (firebaseapp.com) from the opener (humsee.works) and breaks postMessage.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

const origins = allowedOrigins();
app.use(cors({
  origin(origin, callback) {
    // Same-origin / curl / server-to-server (no Origin header)
    if (!origin) return callback(null, true);
    callback(null, origins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Lightweight API telemetry for the Admin Panel (health/usage metrics).
app.use((req, res, next) => {
  console.error('[mproxy]', req.method, req.path);
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      try {
        recordRequest(req.method, req.path, res.statusCode, Date.now() - start, req.user && req.user.id);
      } catch (e) {
        console.error('[mproxy-err]', e.message);
      }
    }
  });
  next();
});

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/auth/mfa', require('./routes/mfa'));
// Public visitor/lead tracking (rate-limited, no auth).
app.use('/api/track',    require('./routes/track'));
// Gmail OAuth callback must be reachable BEFORE the /api/admin routers below run
// their JWT middleware: Google's redirect carries no Authorization header.
app.use('/api/admin/gmail', require('./routes/gmail'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/admin',    require('./routes/leads'));
app.use('/api/admin',    require('./routes/decisions'));
app.use('/api/admin',    require('./routes/approvals'));
app.use('/api/admin',    require('./routes/recruiter'));
app.use('/api/admin',    require('./routes/numerology'));
app.use('/api/admin',    require('./routes/numerologyPdf'));
app.use('/api/admin/inner-intelligence', require('./routes/innerIntelligence'));
app.use('/api/admin',    require('./routes/candidateAnalyze'));
app.use('/api/admin/panel', require('./routes/adminPanel'));
app.use('/api/employee', require('./routes/employee'));

const distDir = path.join(__dirname, '..', 'frontend', 'dist');
// Short-link redirect (/l/:code) MUST be registered before the SPA fallback
// below, otherwise index.html would swallow the 302.
app.use('/l', require('./routes/track').redirectRouter);
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { setHeaders: (res, p) => { if (p.endsWith('index.html')) { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.setHeader('Pragma', 'no-cache'); } } }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  recordError({ message: err.message, stack: err.stack, path: req.path, method: req.method });
  res.status(err.status || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  const { defaultAdminPassword, defaultEmployeePassword } = require('./security');
  const adminPw = process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD env)' : defaultAdminPassword();
  const empPw = process.env.EMPLOYEE_PASSWORD ? '(EMPLOYEE_PASSWORD env)' : defaultEmployeePassword();
  console.log(`\n  Scorecard backend running → http://localhost:${PORT}`);
  console.log(`  Admin     :  test123  / ${adminPw}`);
  console.log(`  Employees :  hkhan    / ${empPw}`);
  console.log('              (see AGENTS.md / Railway ADMIN_PASSWORD & EMPLOYEE_PASSWORD)\n');
});