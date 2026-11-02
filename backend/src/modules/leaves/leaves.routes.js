const router = require('express').Router();
const fs = require('fs');
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { upload, checkUploads, sendUpload } = require('../../middleware/upload');
const { notFound, forbidden, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify, hostelWardenIds, parentUserIds } = require('../../services/notify');
const { getBool } = require('../../services/settings');
const { isStudent, isAdmin } = require('../../utils/scope');
const { toDateStr, addDays, tempCode, assignCode } = require('../../utils/helpers');
const { FEE_STATUS_SQL } = require('../fees/fees.service');

router.use(authenticate);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const MAX_DAYS = 30;

const leaveBody = z.object({
  leaveType: z.enum(['home', 'medical', 'personal', 'academic', 'emergency']),
  fromDate: date,
  toDate: date,
  expectedReturnAt: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/, 'Expected return must include date and time'),
  reason: z.string().trim().min(5).max(500),
  destination: z.string().trim().min(2).max(200),
  guardianContact: z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Invalid guardian phone'),
  emergencyContact: z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Invalid emergency phone'),
}).superRefine((b, ctx) => {
  if (b.toDate < b.fromDate) ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'To date cannot be before from date' });
  const ret = b.expectedReturnAt.slice(0, 10);
  if (ret < b.fromDate || ret > addDays(b.toDate, 1)) ctx.addIssue({ code: 'custom', path: ['expectedReturnAt'], message: 'Expected return must fall within the leave period (or the day after it ends)' });
  const days = (new Date(b.toDate) - new Date(b.fromDate)) / 86_400_000 + 1;
  if (days > MAX_DAYS) ctx.addIssue({ code: 'custom', path: ['toDate'], message: `Leave cannot exceed ${MAX_DAYS} days` });
});

const SELECT = `lr.*, s.name AS student_name, s.register_number, s.phone AS student_phone, d.short_name AS department, s.year_of_study,
  h.id AS hostel_id, h.code AS hostel_code, r.room_number, u.name AS reviewed_by_name,
  (lr.status = 'approved' AND lr.returned_at IS NULL AND lr.expected_return_at < NOW()) AS is_overdue,
  TIMESTAMPDIFF(HOUR, lr.expected_return_at, NOW()) AS hours_overdue`;
const FROM = `FROM leave_requests lr JOIN students s ON s.id = lr.student_id JOIN departments d ON d.id = s.department_id
  LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
  LEFT JOIN hostels h ON h.id = ra.hostel_id LEFT JOIN rooms r ON r.id = ra.room_id LEFT JOIN users u ON u.id = lr.reviewed_by`;

async function loadLeave(id, conn) {
  const l = await db.one(`SELECT ${SELECT}, s.user_id ${FROM} WHERE lr.id = ? ${conn ? 'FOR UPDATE' : ''}`, [id], conn || db.pool);
  if (!l) throw notFound('Leave request');
  return l;
}

function assertAccess(user, l) {
  if (isStudent(user)) { if (l.student_id !== user.studentId) throw forbidden(); return; }
  if (!['leaves.view', 'leaves.review', 'leaves.mark_return'].some((p) => user.permissions.has(p))) throw forbidden();
  if (!isAdmin(user) && l.hostel_id && !user.hostelIds.includes(l.hostel_id)) throw forbidden('This leave belongs to a hostel outside your scope');
}

async function history(conn, leaveId, action, from, to, userId, remarks) {
  await conn.query('INSERT INTO leave_history (leave_id, action, from_status, to_status, acted_by, remarks) VALUES (?,?,?,?,?,?)',
    [leaveId, action, from, to, userId, remarks || null]);
}

async function findOverlap(studentId, from, to, excludeId = 0, conn) {
  return db.one(
    `SELECT leave_code, from_date, to_date, status FROM leave_requests
      WHERE student_id = ? AND id <> ? AND status IN ('pending','approved') AND from_date <= ? AND to_date >= ? LIMIT 1`,
    [studentId, excludeId, to, from], conn || db.pool);
}

/** POST /api/leaves  (multipart; optional "document" file) */
router.post('/', authorize('leaves.apply'), upload.single('document'), checkUploads, async (req, res) => {
  try {
    const b = leaveBody.parse(req.body);
    const studentId = req.user.studentId;
    if (b.fromDate < toDateStr()) throw badRequest('Leave cannot start in the past', 'INVALID_DATE');
    const alloc = await db.one("SELECT hostel_id FROM room_allocations WHERE student_id = ? AND status = 'active'", [studentId]);
    if (!alloc) throw conflict('Only current hostel residents can apply for leave', 'NOT_A_RESIDENT');
    const overlap = await findOverlap(studentId, b.fromDate, b.toDate);
    if (overlap) throw conflict(`Overlaps with ${overlap.leave_code} (${overlap.from_date} to ${overlap.to_date}, ${overlap.status})`, 'LEAVE_OVERLAP');
    if (await getBool('fee_overdue_blocks_leave')) {
      const od = await db.one(`SELECT COUNT(*) AS n FROM student_fees sf WHERE sf.student_id = ? AND ${FEE_STATUS_SQL} = 'overdue'`, [studentId]);
      if (od.n) throw conflict('Hostel policy: leave cannot be requested while fees are overdue. Please contact the office.', 'FEES_OVERDUE_POLICY');
    }
    const out = await db.transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO leave_requests (leave_code, student_id, leave_type, from_date, to_date, expected_return_at, reason, destination,
                                     guardian_contact, emergency_contact, document_name, document_original)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tempCode(), studentId, b.leaveType, b.fromDate, b.toDate, b.expectedReturnAt.replace('T', ' '), b.reason, b.destination,
          b.guardianContact, b.emergencyContact, req.file?.filename || null, req.file?.originalname?.slice(0, 255) || null]);
      const code = await assignCode(conn, 'leave_requests', 'leave_code', 'LV', r.insertId);
      await history(conn, r.insertId, 'submitted', null, 'pending', req.user.id);
      await notify(await hostelWardenIds(alloc.hostel_id, conn), {
        type: 'leave_submitted', title: 'Leave request awaiting approval',
        message: `${req.user.name} requested ${b.leaveType} leave ${b.fromDate} → ${b.toDate} (${code}).`, link: `/leaves?highlight=${r.insertId}`,
      }, conn);
      await audit(req, { action: 'LEAVE_SUBMITTED', module: 'leaves', recordId: r.insertId, summary: `${code} ${b.fromDate} → ${b.toDate}`, newValue: b }, conn);
      return { id: r.insertId, leaveCode: code };
    });
    created(res, out);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    throw err;
  }
});

/** GET /api/leaves  ?status&hostelId&from&to&search&overdue=true&current=true */
router.get('/', async (req, res) => {
  if (!isStudent(req.user) && !['leaves.view', 'leaves.review', 'leaves.mark_return'].some((p) => req.user.permissions.has(p))) throw forbidden();
  const q = parseList(req.query, { sortable: { created: 'lr.created_at', from: 'lr.from_date', return: 'lr.expected_return_at' }, defaultSort: 'created' });
  const where = new Where()
    .addIf(q.status, 'lr.status = ?', q.status)
    .addIf(q.hostelId, 'ra.hostel_id = ?', q.hostelId)
    .addIf(q.leaveType, 'lr.leave_type = ?', q.leaveType)
    .addIf(q.from, 'lr.to_date >= ?', q.from)
    .addIf(q.to, 'lr.from_date <= ?', q.to)
    .search(q.search, ['s.name', 's.register_number', 'lr.leave_code', 'lr.destination']);
  if (q.overdue === 'true') where.add("lr.status = 'approved' AND lr.returned_at IS NULL AND lr.expected_return_at < NOW()");
  if (q.current === 'true') where.add("lr.status = 'approved' AND lr.returned_at IS NULL AND lr.from_date <= CURDATE()");
  if (isStudent(req.user)) where.add('lr.student_id = ?', req.user.studentId || 0);
  else if (!isAdmin(req.user)) where.add('ra.hostel_id IN (?)', req.user.hostelIds.length ? req.user.hostelIds : [0]);
  paged(res, await paginate(db, { select: SELECT, from: FROM, where, ...q }));
});

/** GET /api/leaves/:id  with history */
router.get('/:id', async (req, res) => {
  const l = await loadLeave(req.params.id);
  assertAccess(req.user, l);
  const hist = await db.query(
    `SELECT lh.*, u.name AS acted_by_name FROM leave_history lh LEFT JOIN users u ON u.id = lh.acted_by WHERE lh.leave_id = ? ORDER BY lh.id`, [l.id]);
  ok(res, { ...l, history: hist });
});

/** GET /api/leaves/:id/document */
router.get('/:id/document', async (req, res) => {
  const l = await loadLeave(req.params.id);
  assertAccess(req.user, l);
  if (!l.document_name) throw notFound('Document');
  sendUpload(res, l.document_name, l.document_original);
});

/** PATCH /api/leaves/:id/approve  { remarks } */
router.patch('/:id/approve', authorize('leaves.review'), validate(z.object({ remarks: z.string().trim().max(500).optional() })), async (req, res) => {
  await db.transaction(async (conn) => {
    const l = await loadLeave(req.params.id, conn);
    assertAccess(req.user, l);
    if (l.status !== 'pending') throw conflict(`Leave is already ${l.status}`, 'INVALID_TRANSITION');
    if (l.to_date < toDateStr()) throw conflict('This leave period has already ended', 'LEAVE_EXPIRED');
    const overlap = await findOverlap(l.student_id, l.from_date, l.to_date, l.id, conn);
    if (overlap && overlap.status === 'approved') throw conflict(`Overlaps with approved leave ${overlap.leave_code}`, 'LEAVE_OVERLAP');
    await conn.query("UPDATE leave_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_remarks = ? WHERE id = ?", [req.user.id, req.body.remarks || null, l.id]);
    // Attendance reflects the leave: absences already recorded inside the period become "on leave".
    await conn.query(
      "UPDATE attendance SET status = 'on_leave', remarks = CONCAT_WS(' | ', remarks, ?) WHERE student_id = ? AND attendance_date BETWEEN ? AND ? AND status = 'absent'",
      [`Leave ${l.leave_code} approved`, l.student_id, l.from_date, l.to_date]);
    await history(conn, l.id, 'approved', 'pending', 'approved', req.user.id, req.body.remarks);
    await notify(l.user_id, { type: 'leave_approved', title: 'Leave approved', message: `${l.leave_code} (${l.from_date} → ${l.to_date}) approved. Return by ${l.expected_return_at}.`, link: '/my/leaves' }, conn);
    await notify(await parentUserIds(l.student_id, conn), { type: 'leave_approved', title: `${l.student_name}'s leave approved`, message: `${l.from_date} → ${l.to_date}, ${l.destination}. Expected back by ${l.expected_return_at}.`, link: `/children/${l.student_id}` }, conn);
    await audit(req, { action: 'LEAVE_APPROVED', module: 'leaves', recordId: l.id, summary: `${l.leave_code} approved for ${l.student_name}`, oldValue: { status: 'pending' }, newValue: { status: 'approved', remarks: req.body.remarks } }, conn);
  });
  ok(res, { id: Number(req.params.id), status: 'approved' });
});

/** PATCH /api/leaves/:id/reject  { remarks } */
router.patch('/:id/reject', authorize('leaves.review'), validate(z.object({ remarks: z.string().trim().min(3, 'Please give a reason').max(500) })), async (req, res) => {
  await db.transaction(async (conn) => {
    const l = await loadLeave(req.params.id, conn);
    assertAccess(req.user, l);
    if (l.status !== 'pending') throw conflict(`Leave is already ${l.status}`, 'INVALID_TRANSITION');
    await conn.query("UPDATE leave_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_remarks = ? WHERE id = ?", [req.user.id, req.body.remarks, l.id]);
    await history(conn, l.id, 'rejected', 'pending', 'rejected', req.user.id, req.body.remarks);
    await notify(l.user_id, { type: 'leave_rejected', title: 'Leave rejected', message: `${l.leave_code}: ${req.body.remarks}`, link: '/my/leaves' }, conn);
    await notify(await parentUserIds(l.student_id, conn), { type: 'leave_rejected', title: `${l.student_name}'s leave not approved`, message: `${l.from_date} → ${l.to_date}: ${req.body.remarks}`, link: `/children/${l.student_id}` }, conn);
    await audit(req, { action: 'LEAVE_REJECTED', module: 'leaves', recordId: l.id, summary: `${l.leave_code} rejected for ${l.student_name}: ${req.body.remarks}` }, conn);
  });
  ok(res, { id: Number(req.params.id), status: 'rejected' });
});

/** PATCH /api/leaves/:id/cancel  student withdraws a pending leave, or an approved one before it starts */
router.patch('/:id/cancel', authorize('leaves.apply'), validate(z.object({ remarks: z.string().trim().max(500).optional() })), async (req, res) => {
  await db.transaction(async (conn) => {
    const l = await loadLeave(req.params.id, conn);
    assertAccess(req.user, l);
    const cancellable = l.status === 'pending' || (l.status === 'approved' && l.from_date > toDateStr() && !l.departed_at);
    if (!cancellable) throw conflict('Only pending leave, or approved leave that has not started, can be cancelled', 'INVALID_TRANSITION');
    await conn.query("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", [l.id]);
    await history(conn, l.id, 'cancelled', l.status, 'cancelled', req.user.id, req.body.remarks);
    await audit(req, { action: 'LEAVE_CANCELLED', module: 'leaves', recordId: l.id, summary: `${l.leave_code} cancelled by student` }, conn);
  });
  ok(res, { id: Number(req.params.id), status: 'cancelled' });
});

/** PATCH /api/leaves/:id/depart  gate records departure */
router.patch('/:id/depart', authorize('leaves.mark_return'), async (req, res) => {
  await db.transaction(async (conn) => {
    const l = await loadLeave(req.params.id, conn);
    assertAccess(req.user, l);
    if (l.status !== 'approved' || l.departed_at) throw conflict('Departure can only be recorded once for an approved leave', 'INVALID_TRANSITION');
    if (l.from_date > toDateStr()) throw conflict(`Leave starts on ${l.from_date}`, 'LEAVE_NOT_STARTED');
    await conn.query('UPDATE leave_requests SET departed_at = NOW() WHERE id = ?', [l.id]);
    await history(conn, l.id, 'departed', 'approved', 'approved', req.user.id, 'Departure recorded at gate');
    await notify(await parentUserIds(l.student_id, conn), { type: 'leave_departed', title: `${l.student_name} has left the hostel`, message: `Departed on approved leave to ${l.destination}. Expected back by ${l.expected_return_at}.`, link: `/children/${l.student_id}` }, conn);
    await audit(req, { action: 'LEAVE_DEPARTED', module: 'leaves', recordId: l.id, summary: `${l.student_name} left campus on ${l.leave_code}` }, conn);
  });
  ok(res, { id: Number(req.params.id) });
});

/** PATCH /api/leaves/:id/return  { remarks }  records the student's return; resolves overdue exceptions */
router.patch('/:id/return', authorize('leaves.mark_return'), validate(z.object({ remarks: z.string().trim().max(500).optional() })), async (req, res) => {
  const out = await db.transaction(async (conn) => {
    const l = await loadLeave(req.params.id, conn);
    assertAccess(req.user, l);
    if (l.status !== 'approved') throw conflict(`Leave is ${l.status}; return cannot be recorded`, 'INVALID_TRANSITION');
    const late = l.is_overdue === 1;
    await conn.query("UPDATE leave_requests SET status = 'returned', returned_at = NOW(), return_marked_by = ? WHERE id = ?", [req.user.id, l.id]);
    await conn.query(
      `UPDATE attendance_exceptions SET status = 'resolved', resolution_notes = ?, resolved_by = ?, resolved_at = NOW()
        WHERE student_id = ? AND exception_type = 'leave_overdue' AND status IN ('open','investigating')`,
      [`Student returned${late ? ` ${l.hours_overdue}h late` : ''}`, req.user.id, l.student_id]);
    await history(conn, l.id, 'returned', 'approved', 'returned', req.user.id, req.body.remarks || (late ? `Returned ${l.hours_overdue}h after expected time` : 'Returned on time'));
    await notify(await parentUserIds(l.student_id, conn), { type: 'leave_returned', title: `${l.student_name} is back at the hostel`, message: `Return from ${l.leave_code} recorded${late ? ` (${l.hours_overdue}h after the expected time)` : ''}.`, link: `/children/${l.student_id}` }, conn);
    await audit(req, { action: 'LEAVE_RETURNED', module: 'leaves', recordId: l.id, summary: `${l.student_name} returned from ${l.leave_code}${late ? ' (late)' : ''}` }, conn);
    return { late };
  });
  ok(res, { id: Number(req.params.id), status: 'returned', ...out });
});

module.exports = router;
