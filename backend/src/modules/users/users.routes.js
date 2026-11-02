const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { isAdmin } = require('../../utils/scope');
const { passwordSchema } = require('../auth/auth.routes');

router.use(authenticate);

const STAFF_ROLES = ['super_admin', 'warden', 'staff', 'security'];
const skills = ['electrical', 'plumbing', 'cleaning', 'internet', 'furniture', 'food', 'security', 'general'];

const userBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Invalid phone number').optional().nullable(),
  role: z.enum(STAFF_ROLES),
  designation: z.string().trim().max(80).optional().nullable(),
  staffSkill: z.enum(skills).optional().nullable(),
  hostelIds: z.array(z.coerce.number().int().positive()).default([]),
  password: passwordSchema,
});

/** GET /api/users  (admin) list non-student accounts */
router.get('/', authorize('users.manage'), async (req, res) => {
  const q = parseList(req.query, {
    sortable: { name: 'u.name', email: 'u.email', role: 'r.name', created: 'u.created_at', lastLogin: 'u.last_login_at' },
    defaultSort: 'name',
    defaultOrder: 'asc',
  });
  const where = new Where().add('u.deleted_at IS NULL').add("r.name <> 'student'")
    .search(q.search, ['u.name', 'u.email', 'u.phone'])
    .addIf(q.role, 'r.name = ?', q.role)
    .addIf(q.status, 'u.status = ?', q.status);
  paged(res, await paginate(db, {
    select: `u.id, u.name, u.email, u.phone, u.designation, u.staff_skill, u.status, u.last_login_at, u.created_at,
             r.name AS role, r.label AS role_label,
             (SELECT GROUP_CONCAT(h.name ORDER BY h.name SEPARATOR ', ') FROM user_hostels uh JOIN hostels h ON h.id = uh.hostel_id WHERE uh.user_id = u.id) AS hostels,
             (SELECT JSON_ARRAYAGG(uh.hostel_id) FROM user_hostels uh WHERE uh.user_id = u.id) AS hostel_ids`,
    from: 'FROM users u JOIN roles r ON r.id = u.role_id',
    where, ...q, orderBy: q.orderBy,
  }));
});

/** GET /api/users/staff?hostelId=&role=  staff directory for assignment dropdowns */
router.get('/staff', authorize('complaints.assign', 'maintenance.manage', 'users.manage'), async (req, res) => {
  const where = new Where().add("u.status = 'active'").add('u.deleted_at IS NULL')
    .add(`r.name IN (?)`, req.query.role ? [String(req.query.role)] : ['staff', 'warden']);
  if (req.query.hostelId) where.add('EXISTS (SELECT 1 FROM user_hostels uh WHERE uh.user_id = u.id AND uh.hostel_id = ?)', Number(req.query.hostelId));
  else if (!isAdmin(req.user)) where.add('EXISTS (SELECT 1 FROM user_hostels uh WHERE uh.user_id = u.id AND uh.hostel_id IN (?))', req.user.hostelIds.length ? req.user.hostelIds : [0]);
  const rows = await db.query(
    `SELECT u.id, u.name, u.designation, u.staff_skill, r.name AS role,
            (SELECT COUNT(*) FROM complaints c WHERE c.assigned_to = u.id AND c.status IN ('assigned','in_progress')) AS open_complaints
       FROM users u JOIN roles r ON r.id = u.role_id ${where.sql} ORDER BY u.name`, where.params);
  ok(res, rows);
});

async function setHostels(conn, userId, hostelIds) {
  await conn.query('DELETE FROM user_hostels WHERE user_id = ?', [userId]);
  if (hostelIds.length) await conn.query('INSERT INTO user_hostels (user_id, hostel_id) VALUES ?', [hostelIds.map((h) => [userId, h])]);
}

/** POST /api/users  (admin) create staff / warden / security / admin account */
router.post('/', authorize('users.manage'), validate(userBody), async (req, res) => {
  const b = req.body;
  if (b.role !== 'super_admin' && !b.hostelIds.length) throw badRequest('Assign at least one hostel to this user', 'HOSTEL_REQUIRED');
  const hash = await bcrypt.hash(b.password, 10);
  const id = await db.transaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO users (role_id, name, email, phone, password_hash, designation, staff_skill)
       VALUES ((SELECT id FROM roles WHERE name = ?),?,?,?,?,?,?)`,
      [b.role, b.name, b.email, b.phone || null, hash, b.designation || null, b.staffSkill || null]);
    await setHostels(conn, r.insertId, b.role === 'super_admin' ? [] : b.hostelIds);
    await audit(req, { action: 'USER_CREATED', module: 'users', recordId: r.insertId, summary: `Created ${b.role} account ${b.email}`, newValue: { ...b, password: undefined } }, conn);
    return r.insertId;
  });
  created(res, { id });
});

/** PUT /api/users/:id  (admin) update profile, role and hostel assignments */
router.put('/:id', authorize('users.manage'), validate(userBody.omit({ password: true }).partial()), async (req, res) => {
  const id = Number(req.params.id);
  const before = await db.one(
    `SELECT u.id, u.name, u.email, u.phone, u.designation, u.staff_skill, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL AND r.name <> 'student'`, [id]);
  if (!before) throw notFound('User');
  const b = req.body;
  await db.transaction(async (conn) => {
    await conn.query(
      `UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = ?, designation = ?, staff_skill = ?,
              role_id = COALESCE((SELECT id FROM roles WHERE name = ?), role_id) WHERE id = ?`,
      [b.name ?? null, b.email ?? null, b.phone ?? before.phone, b.designation ?? before.designation,
        b.staffSkill ?? before.staff_skill, b.role ?? null, id]);
    if (b.hostelIds) await setHostels(conn, id, (b.role ?? before.role) === 'super_admin' ? [] : b.hostelIds);
    await audit(req, { action: 'USER_UPDATED', module: 'users', recordId: id, summary: `Updated account ${before.email}`, oldValue: before, newValue: b }, conn);
  });
  ok(res, { id });
});

/** PATCH /api/users/:id/status  { status: active|inactive|locked } */
router.patch('/:id/status', authorize('users.manage'),
  validate(z.object({ status: z.enum(['active', 'inactive', 'locked']) })), async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw badRequest('You cannot change your own account status', 'SELF_STATUS_CHANGE');
    const before = await db.one('SELECT id, email, status FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!before) throw notFound('User');
    await db.query('UPDATE users SET status = ?, failed_logins = 0, token_version = token_version + 1 WHERE id = ?', [req.body.status, id]);
    await audit(req, { action: 'USER_STATUS_CHANGED', module: 'users', recordId: id, summary: `${before.email}: ${before.status} → ${req.body.status}`, oldValue: { status: before.status }, newValue: req.body });
    ok(res, { id, status: req.body.status });
  });

/** POST /api/users/:id/reset-password  (admin) set a temporary password */
router.post('/:id/reset-password', authorize('users.manage'), validate(z.object({ password: passwordSchema })), async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.one('SELECT id, email FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!u) throw notFound('User');
  await db.query(
    "UPDATE users SET password_hash = ?, failed_logins = 0, status = IF(status = 'locked','active',status), token_version = token_version + 1 WHERE id = ?",
    [await bcrypt.hash(req.body.password, 10), id]);
  await audit(req, { action: 'PASSWORD_RESET_BY_ADMIN', module: 'users', recordId: id, summary: `Password reset for ${u.email}` });
  ok(res, { id });
});

/** GET /api/users/roles */
router.get('/roles', authorize('users.manage'), async (_req, res) => {
  ok(res, await db.query(
    `SELECT r.id, r.name, r.label, r.description, COUNT(rp.permission_id) AS permission_count,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id GROUP BY r.id ORDER BY r.id`));
});

module.exports = router;
