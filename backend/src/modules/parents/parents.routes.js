// Parent / guardian portal (read-only view of linked children) and parent account management.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, forbidden, conflict } = require('../../utils/AppError');
const { ok, created } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { isAdmin } = require('../../utils/scope');
const { studentOverview } = require('../students/students.service');
const { monthAttendance } = require('../attendance/attendance.service');
const { FEE_STATUS_SQL } = require('../fees/fees.service');
const { passwordSchema } = require('../auth/auth.routes');

router.use(authenticate);

// ---------------------------------------------------------------- portal
const portal = authorize('parent.portal');

function assertChild(user, studentId) {
  if (!user.childIds.includes(Number(studentId))) throw forbidden('This student is not linked to your account');
}

/** GET /api/parents/children  summary card per linked child */
router.get('/children', portal, async (req, res) => {
  if (!req.user.childIds.length) return ok(res, []);
  const rows = await db.query(
    `SELECT s.id, s.name, s.register_number, s.year_of_study, s.semester, s.hostel_status, d.short_name AS department, d.name AS department_name,
            ps.relation, h.name AS hostel_name, h.code AS hostel_code, r.room_number, b.bed_code,
            w.name AS warden_name, w.phone AS warden_phone,
            (SELECT COALESCE(SUM(IF(sf.waived = 0, sf.total_amount - sf.discount - sf.amount_paid, 0)),0) FROM student_fees sf WHERE sf.student_id = s.id) AS fee_due,
            (SELECT COUNT(*) FROM student_fees sf WHERE sf.student_id = s.id AND ${FEE_STATUS_SQL} = 'overdue') AS overdue_fees,
            (SELECT ROUND(100 * SUM(a.status IN ('present','late')) / NULLIF(SUM(a.status IN ('present','late','absent')),0), 1)
               FROM attendance a WHERE a.student_id = s.id AND a.attendance_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS attendance_pct,
            (SELECT a.status FROM attendance a WHERE a.student_id = s.id AND a.attendance_date = CURDATE()) AS today_status,
            (SELECT JSON_OBJECT('code', l.leave_code, 'to', l.to_date, 'ret', l.expected_return_at, 'overdue', l.expected_return_at < NOW())
               FROM leave_requests l WHERE l.student_id = s.id AND l.status = 'approved' AND l.returned_at IS NULL AND l.from_date <= CURDATE()
              ORDER BY l.from_date DESC LIMIT 1) AS current_leave,
            (SELECT COUNT(*) FROM leave_requests l WHERE l.student_id = s.id AND l.status = 'pending') AS pending_leaves,
            (SELECT COUNT(*) FROM complaints c WHERE c.student_id = s.id AND c.status IN ('pending','assigned','in_progress')) AS open_complaints
       FROM parent_students ps
       JOIN students s ON s.id = ps.student_id JOIN departments d ON d.id = s.department_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
       LEFT JOIN hostels h ON h.id = ra.hostel_id LEFT JOIN rooms r ON r.id = ra.room_id LEFT JOIN beds b ON b.id = ra.bed_id
       LEFT JOIN users w ON w.id = h.warden_id
      WHERE ps.parent_user_id = ? ORDER BY s.name`, [req.user.id]);
  ok(res, rows);
});

/** GET /api/parents/children/:studentId  full read-only view: stay, fees + payments, leave, activities, complaints, visitors */
router.get('/children/:studentId', portal, async (req, res) => {
  const studentId = Number(req.params.studentId);
  assertChild(req.user, studentId);
  const overview = await studentOverview(studentId);
  if (!overview) throw notFound('Student');
  const [payments, leaves, activities] = await Promise.all([
    db.query(
      `SELECT p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, fs.name AS fee_name
         FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id
        WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]),
    db.query(
      `SELECT l.id, l.leave_code, l.leave_type, l.from_date, l.to_date, l.expected_return_at, l.destination, l.reason, l.status,
              l.review_remarks, l.reviewed_at, u.name AS reviewed_by, l.departed_at, l.returned_at, l.created_at,
              (l.status = 'approved' AND l.returned_at IS NULL AND l.expected_return_at < NOW()) AS overdue
         FROM leave_requests l LEFT JOIN users u ON u.id = l.reviewed_by
        WHERE l.student_id = ? ORDER BY l.from_date DESC LIMIT 50`, [studentId]),
    db.query(
      `SELECT a.id, a.title, a.category, a.venue, a.start_at, a.end_at, a.status, ap.registered_at, ap.attended
         FROM activity_participants ap JOIN activities a ON a.id = ap.activity_id
        WHERE ap.student_id = ? ORDER BY a.start_at DESC LIMIT 50`, [studentId]),
  ]);
  const s = overview.student;
  // Parents see the hostel record, not internal account fields.
  delete s.account_status;
  delete s.last_login_at;
  delete s.user_id;
  ok(res, { ...overview, payments, leaves, activities });
});

/** GET /api/parents/children/:studentId/attendance?month=YYYY-MM */
router.get('/children/:studentId/attendance', portal, async (req, res) => {
  assertChild(req.user, req.params.studentId);
  ok(res, await monthAttendance(Number(req.params.studentId), req.query.month));
});

// ---------------------------------------------------------------- management (admin / warden)
const manage = authorize('parents.manage');

async function assertStudentInScope(user, studentId) {
  const s = await db.one(
    `SELECT s.id, s.name, s.register_number, ra.hostel_id FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
      WHERE s.id = ? AND s.deleted_at IS NULL`, [studentId]);
  if (!s) throw notFound('Student');
  if (!isAdmin(user) && s.hostel_id && !user.hostelIds.includes(s.hostel_id)) throw forbidden('This student belongs to a hostel outside your scope');
  return s;
}

/** GET /api/parents/student/:studentId  parents linked to a student */
router.get('/student/:studentId', manage, async (req, res) => {
  await assertStudentInScope(req.user, req.params.studentId);
  ok(res, await db.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.last_login_at, ps.relation, ps.is_primary, ps.created_at,
            (SELECT COUNT(*) FROM parent_students x WHERE x.parent_user_id = u.id) AS children
       FROM parent_students ps JOIN users u ON u.id = ps.parent_user_id
      WHERE ps.student_id = ? AND u.deleted_at IS NULL ORDER BY ps.is_primary DESC, u.name`, [req.params.studentId]));
});

/**
 * POST /api/parents/link  { studentId, name, email, phone?, relation, password? }
 * Links an existing parent account (matched by email) or creates one. A sibling reuses the same account.
 */
router.post('/link', manage, validate(z.object({
  studentId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Invalid phone number').optional().or(z.literal('')),
  relation: z.string().trim().min(2).max(30),
  password: passwordSchema.optional().or(z.literal('')),
})), async (req, res) => {
  const b = req.body;
  const student = await assertStudentInScope(req.user, b.studentId);
  const out = await db.transaction(async (conn) => {
    const existing = await db.one(
      `SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? AND u.deleted_at IS NULL`, [b.email], conn);
    let parentId = existing?.id;
    let temporaryPassword;
    if (existing && existing.role !== 'parent') throw conflict('This email belongs to a non-parent account', 'EMAIL_EXISTS');
    if (!existing) {
      temporaryPassword = b.password || `Parent@${student.register_number.slice(-4)}`;
      const [u] = await conn.query(
        "INSERT INTO users (role_id, name, email, phone, password_hash) VALUES ((SELECT id FROM roles WHERE name = 'parent'),?,?,?,?)",
        [b.name, b.email, b.phone || null, await bcrypt.hash(temporaryPassword, 10)]);
      parentId = u.insertId;
    }
    const [l] = await conn.query(
      'INSERT IGNORE INTO parent_students (parent_user_id, student_id, relation, is_primary, created_by) VALUES (?,?,?,?,?)',
      [parentId, student.id, b.relation, 1, req.user.id]);
    if (!l.affectedRows) throw conflict('This parent is already linked to the student', 'ALREADY_LINKED');
    await notify(parentId, {
      type: 'parent_linked', title: `Linked to ${student.name}`,
      message: `You can now follow ${student.name}'s hostel attendance, fees, leave and activities.`, link: `/children/${student.id}`,
    }, conn);
    await audit(req, { action: 'PARENT_LINKED', module: 'parents', recordId: student.id, summary: `${b.relation} ${b.name} (${b.email}) linked to ${student.register_number}${existing ? '' : ' · new account'}`, newValue: { ...b, password: undefined } }, conn);
    return { parentUserId: parentId, created: !existing, temporaryPassword: b.password ? undefined : temporaryPassword };
  });
  created(res, out);
});

/** DELETE /api/parents/link/:parentUserId/:studentId  removes the link (the account stays) */
router.delete('/link/:parentUserId/:studentId', manage, async (req, res) => {
  const student = await assertStudentInScope(req.user, req.params.studentId);
  const [r] = await db.pool.query('DELETE FROM parent_students WHERE parent_user_id = ? AND student_id = ?', [req.params.parentUserId, student.id]);
  if (!r.affectedRows) throw notFound('Link');
  await audit(req, { action: 'PARENT_UNLINKED', module: 'parents', recordId: student.id, summary: `Parent account ${req.params.parentUserId} unlinked from ${student.register_number}` });
  ok(res, { unlinked: true });
});

module.exports = router;
