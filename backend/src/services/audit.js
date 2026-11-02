const db = require('../config/db');

/**
 * Records an immutable audit entry. Pass `conn` to write inside an open transaction
 * so the log is rolled back together with the change it describes.
 */
async function audit(req, { action, module, recordId, summary, oldValue, newValue }, conn) {
  const u = req?.user;
  await db.query(
    `INSERT INTO audit_logs (user_id, user_name, user_role, action, module, record_id, summary, old_value, new_value, ip_address, user_agent)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      u?.id ?? null, u?.name ?? 'system', u?.role ?? 'system', action, module,
      recordId != null ? String(recordId) : null, summary ?? null,
      oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null,
      req?.ip ?? null, req?.get?.('user-agent')?.slice(0, 255) ?? null,
    ],
    conn || db.pool,
  );
}

module.exports = { audit };
