const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../security');
const db = require('../database');
const { PERMISSIONS } = require('../analyticsDb');

const JWT_SECRET = jwtSecret();

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user && req.user.role === role) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

// Map core role -> conceptual RBAC role used by the permission matrix.
function conceptualRole(role) {
  if (role === 'admin') return 'admin';
  if (role === 'employee') return 'recruiter';
  return 'admin';
}

function hasPermission(user, permission) {
  if (!user) return false;
  try {
    const r = conceptualRole(user.role);
    if (r === 'super-admin') return true;
    const row = db.prepare('SELECT 1 FROM role_permissions WHERE role = ? AND permission = ?').get(r, permission);
    if (row) return true;
    if (r === 'admin' && PERMISSIONS.includes(permission)) return true;
    return false;
  } catch (e) {
    return user.role === 'admin';
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (hasPermission(req.user, permission)) return next();
    return res.status(403).json({ error: `Missing permission: ${permission}` });
  };
}

module.exports = { authenticate, requireRole, requirePermission, hasPermission, conceptualRole };