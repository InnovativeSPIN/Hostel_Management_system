const db = require('../config/db');

/**
 * Sends a notification to one or many users. A `dedupeKey` makes automated alerts idempotent
 * (the same alert is never sent twice to the same user).
 */
async function notify(userIds, { type, title, message, link = null, dedupeKey = null }, conn) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))];
  if (!ids.length) return 0;
  const values = ids.map((id) => [id, type, title, message.slice(0, 500), link, dedupeKey]);
  const [res] = await (conn || db.pool).query(
    'INSERT IGNORE INTO notifications (user_id, type, title, message, link, dedupe_key) VALUES ?',
    [values],
  );
  return res.affectedRows;
}

async function studentUserId(studentId, conn) {
  const row = await db.one('SELECT user_id FROM students WHERE id = ?', [studentId], conn || db.pool);
  return row?.user_id;
}

// Wardens assigned to the hostel (plus the hostel's primary warden).
async function hostelWardenIds(hostelId, conn) {
  const rows = await db.query(
    `SELECT DISTINCT u.id FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'warden'
       LEFT JOIN user_hostels uh ON uh.user_id = u.id
       LEFT JOIN hostels h ON h.warden_id = u.id
      WHERE u.status = 'active' AND u.deleted_at IS NULL AND (uh.hostel_id = ? OR h.id = ?)`,
    [hostelId, hostelId], conn || db.pool,
  );
  return rows.map((r) => r.id);
}

async function adminIds(conn) {
  const rows = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'super_admin' AND u.status = 'active' AND u.deleted_at IS NULL`, [], conn || db.pool);
  return rows.map((r) => r.id);
}

// Active parent / guardian accounts linked to a student.
async function parentUserIds(studentId, conn) {
  const rows = await db.query(
    `SELECT ps.parent_user_id AS id FROM parent_students ps JOIN users u ON u.id = ps.parent_user_id
      WHERE ps.student_id = ? AND u.status = 'active' AND u.deleted_at IS NULL`, [studentId], conn || db.pool);
  return rows.map((r) => r.id);
}

module.exports = { notify, studentUserId, hostelWardenIds, adminIds, parentUserIds };
