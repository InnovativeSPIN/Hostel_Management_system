const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, forbidden } = require('../../utils/AppError');
const { ok, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { scopeHostel, assertHostelAccess, isStudent, isAdmin } = require('../../utils/scope');
const { toDateStr, addDays, pct } = require('../../utils/helpers');
const svc = require('./attendance.service');

router.use(authenticate);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sessionStr = z.enum(['morning', 'evening']).default('morning');
const STATUSES = ['present', 'absent', 'late', 'on_leave', 'medical_leave', 'on_duty', 'out_pass'];

/** GET /api/attendance/roster?hostelId&date&session&floorId&roomId  residents with existing marks and leave flags */
router.get('/roster', authorize('attendance.mark'), async (req, res) => {
  const hostelId = z.coerce.number().int().positive().parse(req.query.hostelId);
  const date = dateStr.default(toDateStr()).parse(req.query.date || undefined);
  const session = sessionStr.parse(req.query.session || undefined);
  assertHostelAccess(req.user, hostelId);
  const rows = await svc.roster(hostelId, date, { session, floorId: req.query.floorId, roomId: req.query.roomId });
  ok(res, { date, session, hostelId, marked: rows.filter((r) => r.attendance_id).length, total: rows.length, students: rows });
});

/**
 * POST /api/attendance
 * { hostelId, date, session?, overwrite?, records: [{ studentId, status, checkInTime?, remarks? }] }
 * Rejects duplicates unless overwrite=true; approved leave converts "absent" to "on_leave".
 * Reason is mandatory for Absent marks.
 */
router.post('/', authorize('attendance.mark'),
  validate(z.object({
    hostelId: z.coerce.number().int().positive(),
    date: dateStr,
    session: sessionStr,
    overwrite: z.boolean().default(false),
    records: z.array(z.object({
      studentId: z.coerce.number().int().positive(),
      status: z.enum(STATUSES),
      checkInTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
      remarks: z.string().trim().max(255).optional().nullable(),
    })).min(1).max(2000),
  }).superRefine((body, ctx) => {
    body.records.forEach((r, idx) => {
      if (r.status === 'absent' && (!r.remarks || r.remarks.trim().length < 3)) {
        ctx.addIssue({
          code: 'custom',
          path: ['records', idx, 'remarks'],
          message: 'Reason (at least 3 characters) is required when marking a student absent',
        });
      }
    });
  })),
  async (req, res) => {
    assertHostelAccess(req.user, req.body.hostelId);
    const result = await svc.mark(req, req.body);
    await svc.scanExceptions(req.body.date, [req.body.hostelId]);
    ok(res, result);
  });

/** GET /api/attendance  ?hostelId&session&status&studentId&from&to&search */
router.get('/', authorize('attendance.view'), async (req, res) => {
  const q = parseList(req.query, { sortable: { date: 'a.attendance_date', student: 's.name', status: 'a.status' }, defaultSort: 'date' });
  const where = new Where()
    .addIf(q.hostelId, 'a.hostel_id = ?', q.hostelId)
    .addIf(q.session, 'a.session = ?', q.session)
    .addIf(q.status, 'a.status = ?', q.status)
    .addIf(q.studentId, 'a.student_id = ?', q.studentId)
    .addIf(q.departmentId, 's.department_id = ?', q.departmentId)
    .addIf(q.from, 'a.attendance_date >= ?', q.from)
    .addIf(q.to, 'a.attendance_date <= ?', q.to)
    .search(q.search, ['s.name', 's.register_number']);
  scopeHostel(where, req.user, 'a.hostel_id');
  paged(res, await paginate(db, {
    select: `a.id, a.attendance_date, a.session, a.status, a.check_in_time, a.remarks, s.id AS student_id, s.name AS student_name, s.register_number,
             d.short_name AS department, h.code AS hostel_code, u.name AS marked_by`,
    from: `FROM attendance a JOIN students s ON s.id = a.student_id JOIN departments d ON d.id = s.department_id
           JOIN hostels h ON h.id = a.hostel_id LEFT JOIN users u ON u.id = a.marked_by`,
    where, ...q,
  }));
});

/** GET /api/attendance/summary?hostelId&days=14  daily trend for charts */
router.get('/summary', authorize('attendance.view'), async (req, res) => {
  const days = Math.min(Number(req.query.days) || 14, 90);
  const from = addDays(toDateStr(), -(days - 1));
  const where = new Where().add('a.attendance_date >= ?', from).addIf(req.query.hostelId, 'a.hostel_id = ?', req.query.hostelId);
  scopeHostel(where, req.user, 'a.hostel_id');
  const rows = await db.query(
    `SELECT a.attendance_date AS date, SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late, SUM(a.status = 'absent') AS absent,
            SUM(a.status = 'on_leave') AS on_leave, SUM(a.status = 'out_pass') AS out_pass, COUNT(*) AS total
       FROM attendance a ${where.sql} GROUP BY a.attendance_date ORDER BY a.attendance_date`, where.params);
  ok(res, rows.map((r) => ({ ...r, percentage: pct(Number(r.present) + Number(r.late), Number(r.present) + Number(r.late) + Number(r.absent)) })));
});

/** GET /api/attendance/student/:studentId?month=YYYY-MM  calendar + monthly percentage */
router.get('/student/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isStudent(req.user)) { if (req.user.studentId !== studentId) throw forbidden(); }
  else if (!req.user.permissions.has('attendance.view')) throw forbidden();
  const student = await db.one(
    `SELECT s.id, s.name, s.register_number, ra.hostel_id FROM students s
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active' WHERE s.id = ?`, [studentId]);
  if (!student) throw notFound('Student');
  if (!isStudent(req.user) && !isAdmin(req.user) && student.hostel_id && !req.user.hostelIds.includes(student.hostel_id)) throw forbidden();
  ok(res, { student, ...(await svc.monthAttendance(studentId, req.query.month)) });
});

/**
 * GET /api/attendance/exceptions?date&hostelId&type&status
 * Attendance Exception Center: runs the scan for the date, returns summary + items + live "not marked" list.
 */
router.get('/exceptions', authorize('attendance.view'), async (req, res) => {
  const date = dateStr.default(toDateStr()).parse(req.query.date || undefined);
  const scope = isAdmin(req.user) ? null : req.user.hostelIds;
  await svc.scanExceptions(date, scope);

  const where = new Where().add('(e.exception_date = ? OR (e.exception_type = \'low_attendance\' AND e.exception_date = ?) OR (e.status IN (\'open\',\'investigating\') AND e.exception_type = \'leave_overdue\'))', date, `${date.slice(0, 7)}-01`)
    .addIf(req.query.hostelId, 'e.hostel_id = ?', req.query.hostelId)
    .addIf(req.query.type, 'e.exception_type = ?', req.query.type)
    .addIf(req.query.status, 'e.status = ?', req.query.status);
  scopeHostel(where, req.user, 'e.hostel_id');
  const items = await db.query(
    `SELECT e.*, s.name AS student_name, s.register_number, s.phone, p.parent_phone, d.short_name AS department, h.code AS hostel_code,
            r.room_number, u.name AS resolved_by_name
       FROM attendance_exceptions e JOIN students s ON s.id = e.student_id JOIN departments d ON d.id = s.department_id
       JOIN hostels h ON h.id = e.hostel_id LEFT JOIN student_profiles p ON p.student_id = s.id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active' LEFT JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN users u ON u.id = e.resolved_by
       ${where.sql} ORDER BY FIELD(e.status,'open','investigating','resolved','dismissed'), FIELD(e.exception_type,'leave_overdue','absent_with_leave','repeated_absence','absent','not_marked','low_attendance'), s.name`,
    where.params);

  // Live counts for the day (independent of persisted exceptions).
  const lw = new Where().add("ra.status = 'active'").add('DATE(ra.allocated_at) <= ?', date).addIf(req.query.hostelId, 'ra.hostel_id = ?', req.query.hostelId);
  scopeHostel(lw, req.user, 'ra.hostel_id');
  const live = await db.one(
    `SELECT COUNT(*) AS residents,
            SUM(a.id IS NULL) AS not_marked,
            SUM(a.status = 'absent') AS absent,
            SUM(a.status IN ('present','late')) AS present,
            SUM(EXISTS (SELECT 1 FROM leave_requests l WHERE l.student_id = ra.student_id AND l.status = 'approved' AND ? BETWEEN l.from_date AND l.to_date)) AS on_approved_leave
       FROM room_allocations ra LEFT JOIN attendance a ON a.student_id = ra.student_id AND a.attendance_date = ? ${lw.sql}`, [date, date, ...lw.params]);
  const notMarked = await db.query(
    `SELECT s.id AS student_id, s.name, s.register_number, h.code AS hostel_code, r.room_number
       FROM room_allocations ra JOIN students s ON s.id = ra.student_id JOIN hostels h ON h.id = ra.hostel_id JOIN rooms r ON r.id = ra.room_id
       ${lw.sql} AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = ra.student_id AND a.attendance_date = ?)
      ORDER BY h.code, r.room_number LIMIT 300`, [...lw.params, date]);

  const open = items.filter((i) => ['open', 'investigating'].includes(i.status));
  const countType = (t) => open.filter((i) => i.exception_type === t).length;
  ok(res, {
    date,
    summary: {
      residents: Number(live.residents || 0), present: Number(live.present || 0),
      absent: Number(live.absent || 0), notMarked: Number(live.not_marked || 0), onApprovedLeave: Number(live.on_approved_leave || 0),
      repeatedAbsence: countType('repeated_absence'), lowAttendance: countType('low_attendance'),
      absentWithLeave: countType('absent_with_leave'), leaveOverdue: countType('leave_overdue'), openExceptions: open.length,
    },
    items,
    notMarked,
  });
});

/** PATCH /api/attendance/exceptions/:id  { status: investigating|resolved|dismissed, notes } */
router.patch('/exceptions/:id', authorize('attendance.resolve'),
  validate(z.object({ status: z.enum(['investigating', 'resolved', 'dismissed']), notes: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    const e = await db.one('SELECT * FROM attendance_exceptions WHERE id = ?', [req.params.id]);
    if (!e) throw notFound('Exception');
    assertHostelAccess(req.user, e.hostel_id);
    const done = ['resolved', 'dismissed'].includes(req.body.status);
    await db.query(
      `UPDATE attendance_exceptions SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = ${done ? 'NOW()' : 'NULL'} WHERE id = ?`,
      [req.body.status, req.body.notes, req.user.id, e.id]);
    await audit(req, { action: 'EXCEPTION_UPDATED', module: 'attendance', recordId: e.id, summary: `${e.exception_type} exception → ${req.body.status}: ${req.body.notes}`, oldValue: { status: e.status }, newValue: req.body });
    ok(res, { id: e.id });
  });

module.exports = router;
