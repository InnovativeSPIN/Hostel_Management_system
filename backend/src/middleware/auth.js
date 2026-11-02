const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { unauthorized, forbidden } = require('../utils/AppError');

let permCache = null;
let permCacheAt = 0;

async function rolePermissions() {
  if (permCache && Date.now() - permCacheAt < 5 * 60_000) return permCache;
  const rows = await db.query(
    `SELECT r.name AS role, p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id`);
  const map = {};
  rows.forEach(({ role, code }) => { (map[role] ||= new Set()).add(code); });
  permCache = map;
  permCacheAt = Date.now();
  return map;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.token_version }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

// Loads the full request identity: role, permissions, hostel scope and student id.
async function loadIdentity(userId) {
  const user = await db.one(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.token_version, u.designation, u.staff_skill, r.name AS role, r.label AS role_label
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL`, [userId]);
  if (!user) return null;
  const perms = (await rolePermissions())[user.role] || new Set();
  let hostelIds = [];
  let studentId = null;
  let childIds = [];
  if (user.role === 'parent') {
    const rows = await db.query(
      `SELECT ps.student_id, ra.hostel_id FROM parent_students ps
         JOIN students s ON s.id = ps.student_id AND s.deleted_at IS NULL
         LEFT JOIN room_allocations ra ON ra.student_id = ps.student_id AND ra.status = 'active'
        WHERE ps.parent_user_id = ?`, [user.id]);
    childIds = rows.map((r) => r.student_id);
    hostelIds = [...new Set(rows.map((r) => r.hostel_id).filter(Boolean))];
  } else if (user.role === 'student') {
    const s = await db.one(
      `SELECT s.id, ra.hostel_id FROM students s
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        WHERE s.user_id = ?`, [user.id]);
    studentId = s?.id ?? null;
    hostelIds = s?.hostel_id ? [s.hostel_id] : [];
  } else if (user.role !== 'super_admin') {
    const rows = await db.query(
      `SELECT hostel_id FROM user_hostels WHERE user_id = ?
       UNION SELECT id FROM hostels WHERE warden_id = ?`, [user.id, user.id]);
    hostelIds = rows.map((r) => r.hostel_id);
  }
  return { ...user, permissions: perms, hostelIds, studentId, childIds };
}

async function authenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw unauthorized('Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    throw unauthorized('Invalid authentication token', 'TOKEN_INVALID');
  }
  const identity = await loadIdentity(payload.sub);
  if (!identity || identity.token_version !== payload.tv) throw unauthorized('Session is no longer valid', 'TOKEN_REVOKED');
  if (identity.status !== 'active') throw unauthorized('Your account is not active', 'ACCOUNT_INACTIVE');
  req.user = identity;
  next();
}

const can = (user, perm) => user.permissions.has(perm);

// Allows the request when the user holds ANY of the listed permissions.
const authorize = (...perms) => (req, _res, next) => {
  if (!req.user) throw unauthorized();
  if (!perms.some((p) => can(req.user, p))) throw forbidden();
  next();
};

const clearPermissionCache = () => { permCache = null; };

module.exports = { authenticate, authorize, can, signToken, loadIdentity, clearPermissionCache };
