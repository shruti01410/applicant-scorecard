// Minimal audit logger. Writes one row per action to `audit_logs`.
// Never throws: logging is best-effort and must not break a request or login.
const db = require('./database');

// Returns the client IP, stripping any proxy prefix that express sets.
function clientIp(req) {
  if (req) return String((req.ip) || '').split(',')[0].trim() || null;
  return null;
}

function logAudit({ performedBy = null, action, targetType = null, targetId = null, detail = null, req = null, module = null, username = null }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (performed_by, user_id, username, action, target_type, target_id, module, detail, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      performedBy,
      performedBy,
      username,
      String(action || '').slice(0, 64),
      String(targetType || '').slice(0, 64) || null,
      targetId == null ? null : Number(targetId),
      module ? String(module).slice(0, 64) : null,
      detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null,
      clientIp(req)
    );
  } catch (e) {
    // best-effort only
  }
}

module.exports = { logAudit, clientIp };