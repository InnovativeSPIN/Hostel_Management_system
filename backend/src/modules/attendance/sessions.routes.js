const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { badRequest, notFound, forbidden } = require('../../utils/AppError');
const { ok, created } = require('../../utils/respond');
const { audit } = require('../../services/audit');
const { assertHostelAccess, isStudent, isAdmin } = require('../../utils/scope');
const { toDateStr, pct } = require('../../utils/helpers');

router.use(authenticate);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SESSION_STATUSES = ['Present', 'Absent', 'Leave', 'Medical Leave', 'On Duty'];

/**
 * GET /api/attendance/sessions/roster
 * ?hostelId=&date=&session=&blockName=
 */
router.get('/roster', authorize('attendance.mark', 'attendance.view'), async (req, res) => {
  const hostelId = z.coerce.number().int().positive().parse(req.query.hostelId);
  const date = dateStr.default(toDateStr()).parse(req.query.date || undefined);
  const session = z.enum(['Morning', 'Evening']).default('Morning').parse(req.query.session || undefined);
  assertHostelAccess(req.user, hostelId);

  // 1. Fetch active residents of the hostel
  const students = await db.query(
    `SELECT s.id AS student_id, s.name, s.register_number, s.photo_url, s.student_type,
            d.short_name AS department, s.year_of_study,
            ra.hostel_id, h.name AS hostel_name, h.code AS hostel_code,
            r.id AS room_id, r.room_number, r.room_category, f.floor_number
       FROM students s
       JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
       JOIN hostels h ON h.id = ra.hostel_id
       JOIN rooms r ON r.id = ra.room_id
       LEFT JOIN floors f ON f.id = r.floor_id
       JOIN departments d ON d.id = s.department_id
      WHERE ra.hostel_id = ? AND s.deleted_at IS NULL
      ORDER BY r.room_number, s.name`,
    [hostelId]
  );

  // 2. Fetch existing session marks for date + session
  const existingRows = await db.query(
    `SELECT att.*, u.name AS marked_by_name
       FROM attendance_sessions att
       LEFT JOIN users u ON u.id = att.marked_by
      WHERE att.hostel_id = ? AND att.attendance_date = ? AND att.session = ?`,
    [hostelId, date, session]
  );
  const existingMap = new Map();
  existingRows.forEach((r) => existingMap.set(r.student_id, r));

  // 3. Fetch approved leaves covering this date
  const leaves = await db.query(
    `SELECT id, student_id, leave_code, leave_type
       FROM leave_requests
      WHERE status = 'approved' AND ? BETWEEN from_date AND to_date`,
    [date]
  );
  const leaveMap = new Map();
  leaves.forEach((l) => leaveMap.set(l.student_id, l));

  // 4. Combine and apply auto-fill logic
  const roster = students.map((s) => {
    const existing = existingMap.get(s.student_id);
    const leave = leaveMap.get(s.student_id);

    if (existing) {
      return {
        ...s,
        sessionRecordId: existing.id,
        status: existing.status,
        absentReason: existing.absent_reason || '',
        remarks: existing.remarks || '',
        autoFilled: Boolean(existing.auto_filled),
        leaveCode: leave?.leave_code || null,
        markedByName: existing.marked_by_name,
        isMarked: true,
      };
    }

    // Auto-fill from approved leave / OD
    let defaultStatus = 'Present';
    let autoFilled = false;
    let leaveId = null;

    if (leave) {
      autoFilled = true;
      leaveId = leave.id;
      if (leave.leave_type === 'on_duty') defaultStatus = 'On Duty';
      else if (leave.leave_type === 'medical') defaultStatus = 'Medical Leave';
      else defaultStatus = 'Leave';
    }

    return {
      ...s,
      sessionRecordId: null,
      status: defaultStatus,
      absentReason: '',
      remarks: leave ? `Auto-filled from ${leave.leave_code}` : '',
      autoFilled,
      leaveId,
      leaveCode: leave?.leave_code || null,
      markedByName: null,
      isMarked: false,
    };
  });

  const markedCount = roster.filter((r) => r.isMarked).length;
  ok(res, {
    hostelId,
    date,
    session,
    markedCount,
    totalCount: roster.length,
    students: roster,
  });
});

/**
 * POST /api/attendance/sessions/save
 * Batch saves session attendance with mandatory absent reasons.
 */
router.post('/save', authorize('attendance.mark'), async (req, res) => {
  const schema = z.object({
    hostelId: z.coerce.number().int().positive(),
    date: dateStr,
    session: z.enum(['Morning', 'Evening']),
    records: z.array(z.object({
      studentId: z.coerce.number().int().positive(),
      roomId: z.coerce.number().int().positive().optional().nullable(),
      blockName: z.string().trim().max(60).optional().nullable(),
      status: z.enum(SESSION_STATUSES),
      absentReason: z.string().trim().max(255).optional().nullable(),
      remarks: z.string().trim().max(255).optional().nullable(),
      autoFilled: z.boolean().default(false),
      leaveId: z.number().int().positive().optional().nullable(),
    })).min(1).superRefine((records, ctx) => {
      records.forEach((r, idx) => {
        if (r.status === 'Absent' && (!r.absentReason || r.absentReason.trim().length < 2)) {
          ctx.addIssue({
            code: 'custom',
            path: ['records', idx, 'absentReason'],
            message: `Reason is mandatory for Absent student #${r.studentId}`,
          });
        }
      });
    }),
  });

  const b = schema.parse(req.body);
  assertHostelAccess(req.user, b.hostelId);

  // Fetch hostel details for block name
  const hostel = await db.one('SELECT id, name, code FROM hostels WHERE id = ?', [b.hostelId]);
  const defaultBlock = hostel ? `Block ${hostel.code}` : 'Main Block';

  const result = await db.transaction(async (conn) => {
    let saved = 0;
    for (const r of b.records) {
      await conn.query(
        `INSERT INTO attendance_sessions
         (student_id, hostel_id, room_id, block_name, attendance_date, session, status, absent_reason, remarks, auto_filled, leave_id, marked_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           absent_reason = VALUES(absent_reason),
           remarks = VALUES(remarks),
           auto_filled = VALUES(auto_filled),
           leave_id = VALUES(leave_id),
           marked_by = VALUES(marked_by),
           updated_at = NOW()`,
        [
          r.studentId,
          b.hostelId,
          r.roomId || null,
          r.blockName || defaultBlock,
          b.date,
          b.session,
          r.status,
          r.status === 'Absent' ? r.absentReason : null,
          r.remarks || null,
          r.autoFilled ? 1 : 0,
          r.leaveId || null,
          req.user.id,
        ]
      );
      saved += 1;
    }

    await audit(req, {
      action: 'ATTENDANCE_SESSION_MARKED',
      module: 'attendance',
      summary: `Marked ${b.session} attendance for ${saved} students on ${b.date} (${hostel?.name || ''})`,
      newValue: { hostelId: b.hostelId, date: b.date, session: b.session, count: saved },
    }, conn);

    return { saved, date: b.date, session: b.session };
  });

  ok(res, result);
});

/**
 * GET /api/attendance/sessions/report/day
 * ?date=&session=&hostelId=&block=
 */
router.get('/report/day', authorize('attendance.view'), async (req, res) => {
  const date = req.query.date || toDateStr();
  const session = req.query.session || null;
  const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;
  const block = req.query.block || null;

  let sql = `
    SELECT att.*, s.name AS student_name, s.register_number, s.photo_url, d.short_name AS department,
           h.name AS hostel_name, h.code AS hostel_code, r.room_number, u.name AS marked_by_name
      FROM attendance_sessions att
      JOIN students s ON s.id = att.student_id
      JOIN departments d ON d.id = s.department_id
      JOIN hostels h ON h.id = att.hostel_id
      LEFT JOIN rooms r ON r.id = att.room_id
      LEFT JOIN users u ON u.id = att.marked_by
     WHERE att.attendance_date = ?
  `;
  const params = [date];

  if (session) { sql += ' AND att.session = ?'; params.push(session); }
  if (hostelId) { sql += ' AND att.hostel_id = ?'; params.push(hostelId); }
  if (block) { sql += ' AND att.block_name = ?'; params.push(block); }

  sql += ' ORDER BY att.session, att.block_name, r.room_number, s.name';

  const rows = await db.query(sql, params);

  const stats = {
    total: rows.length,
    present: rows.filter((r) => r.status === 'Present').length,
    absent: rows.filter((r) => r.status === 'Absent').length,
    leave: rows.filter((r) => r.status === 'Leave').length,
    medicalLeave: rows.filter((r) => r.status === 'Medical Leave').length,
    onDuty: rows.filter((r) => r.status === 'On Duty').length,
  };
  const percentage = stats.total ? pct(stats.present + stats.onDuty, stats.total) : 0;

  ok(res, {
    date,
    session,
    stats: { ...stats, percentage },
    absentees: rows.filter((r) => r.status === 'Absent'),
    records: rows,
  });
});

/**
 * GET /api/attendance/sessions/report/month
 * ?yearMonth=2026-11&hostelId=&block=
 */
router.get('/report/month', authorize('attendance.view'), async (req, res) => {
  const ym = req.query.yearMonth || toDateStr().slice(0, 7);
  const hostelId = req.query.hostelId ? Number(req.query.hostelId) : null;

  let where = 'WHERE DATE_FORMAT(attendance_date, "%Y-%m") = ?';
  const params = [ym];
  if (hostelId) { where += ' AND hostel_id = ?'; params.push(hostelId); }

  const rows = await db.query(
    `SELECT attendance_date, session,
            COUNT(*) AS total,
            SUM(status = 'Present') AS present,
            SUM(status = 'Absent') AS absent,
            SUM(status = 'Leave') AS on_leave,
            SUM(status = 'Medical Leave') AS medical_leave,
            SUM(status = 'On Duty') AS on_duty
       FROM attendance_sessions
       ${where}
      GROUP BY attendance_date, session
      ORDER BY attendance_date ASC, session ASC`,
    params
  );

  ok(res, {
    yearMonth: ym,
    days: rows.map((r) => ({
      date: toDateStr(r.attendance_date),
      session: r.session,
      total: Number(r.total),
      present: Number(r.present),
      absent: Number(r.absent),
      leave: Number(r.on_leave),
      medicalLeave: Number(r.medical_leave),
      onDuty: Number(r.on_duty),
      percentage: pct(Number(r.present) + Number(r.on_duty), Number(r.total)),
    })),
  });
});

/**
 * GET /api/attendance/sessions/report/student/:studentId
 * Student specific session breakdown
 */
router.get('/report/student/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isStudent(req.user) && req.user.studentId !== studentId) throw forbidden();

  const student = await db.one('SELECT id, name, register_number FROM students WHERE id = ?', [studentId]);
  if (!student) throw notFound('Student');

  const rows = await db.query(
    `SELECT att.*, h.name AS hostel_name, r.room_number, u.name AS marked_by_name
       FROM attendance_sessions att
       JOIN hostels h ON h.id = att.hostel_id
       LEFT JOIN rooms r ON r.id = att.room_id
       LEFT JOIN users u ON u.id = att.marked_by
      WHERE att.student_id = ?
      ORDER BY att.attendance_date DESC, att.session DESC
      LIMIT 100`,
    [studentId]
  );

  const total = rows.length;
  const present = rows.filter((r) => r.status === 'Present').length;
  const onDuty = rows.filter((r) => r.status === 'On Duty').length;
  const absent = rows.filter((r) => r.status === 'Absent').length;
  const leave = rows.filter((r) => r.status === 'Leave').length;
  const medicalLeave = rows.filter((r) => r.status === 'Medical Leave').length;
  const percentage = total ? pct(present + onDuty, total) : 0;

  ok(res, {
    student,
    stats: { total, present, absent, leave, medicalLeave, onDuty, percentage },
    records: rows,
  });
});

/**
 * GET /api/attendance/sessions/report/block
 * Grouped comparison across Blocks
 */
router.get('/report/block', authorize('attendance.view'), async (req, res) => {
  const date = req.query.date || toDateStr();
  const session = req.query.session || 'Morning';

  const rows = await db.query(
    `SELECT block_name,
            COUNT(*) AS total,
            SUM(status = 'Present') AS present,
            SUM(status = 'Absent') AS absent,
            SUM(status = 'Leave') AS on_leave,
            SUM(status = 'Medical Leave') AS medical_leave,
            SUM(status = 'On Duty') AS on_duty
       FROM attendance_sessions
      WHERE attendance_date = ? AND session = ?
      GROUP BY block_name
      ORDER BY block_name ASC`,
    [date, session]
  );

  ok(res, {
    date,
    session,
    blocks: rows.map((r) => ({
      blockName: r.block_name || 'General',
      total: Number(r.total),
      present: Number(r.present),
      absent: Number(r.absent),
      leave: Number(r.on_leave),
      medicalLeave: Number(r.medical_leave),
      onDuty: Number(r.on_duty),
      percentage: pct(Number(r.present) + Number(r.on_duty), Number(r.total)),
    })),
  });
});

module.exports = router;
