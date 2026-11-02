const router = require('express').Router();
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { notFound } = require('../../utils/AppError');
const { ok } = require('../../utils/respond');
const { studentOverview } = require('../students/students.service');
const svc = require('./dashboard.service');

router.use(authenticate);

/** GET /api/dashboard/command?hostelId=  Hostel Command Center (KPIs, exceptions, action center, charts, health) */
router.get('/command', authorize('dashboard.command'), async (req, res) => ok(res, await svc.commandCenter(req.user, req.query.hostelId)));
/** GET /api/dashboard/admin   GET /api/dashboard/warden  (same data, scoped by role) */
router.get('/admin', authorize('dashboard.command'), async (req, res) => ok(res, await svc.commandCenter(req.user, req.query.hostelId)));
router.get('/warden', authorize('dashboard.command'), async (req, res) => ok(res, await svc.commandCenter(req.user, req.query.hostelId)));

/** GET /api/dashboard/actions  Action Center only */
router.get('/actions', authorize('dashboard.command'), async (req, res) => {
  ok(res, await svc.actionItems(await svc.resolveHostels(req.user, req.query.hostelId), 200));
});

/** GET /api/dashboard/student  self-service overview */
router.get('/student', async (req, res) => {
  if (!req.user.studentId) throw notFound('Student record');
  const overview = await studentOverview(req.user.studentId);
  const hostelIds = req.user.hostelIds.length ? req.user.hostelIds : [0];
  const [announcements, activities] = await Promise.all([
    db.query(
      `SELECT id, title, body, priority, published_at FROM announcements
        WHERE deleted_at IS NULL AND audience IN ('all','students') AND (hostel_id IS NULL OR hostel_id IN (?))
          AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY FIELD(priority,'urgent','important','normal'), published_at DESC LIMIT 5`, [hostelIds]),
    db.query(
      `SELECT a.id, a.title, a.category, a.venue, a.start_at,
              EXISTS (SELECT 1 FROM activity_participants p WHERE p.activity_id = a.id AND p.student_id = ?) AS registered
         FROM activities a WHERE a.status = 'scheduled' AND a.start_at >= NOW() AND (a.hostel_id IS NULL OR a.hostel_id IN (?))
        ORDER BY a.start_at LIMIT 5`, [req.user.studentId, hostelIds]),
  ]);
  ok(res, {
    ...overview,
    counts: {
      pendingLeaves: overview.leaves.filter((l) => l.status === 'pending').length,
      openComplaints: overview.complaints.filter((c) => ['pending', 'assigned', 'in_progress', 'resolved'].includes(c.status)).length,
    },
    announcements,
    activities,
  });
});

/** GET /api/dashboard/security  "Who is currently inside?" */
router.get('/security', authorize('security.dashboard'), async (req, res) => {
  const ids = await svc.resolveHostels(req.user, req.query.hostelId);
  const [presence, onLeave, overdue, visitorsInside, expected, departingToday, visitorStats] = await Promise.all([
    db.one(
      `SELECT COUNT(*) AS residents,
              SUM(EXISTS (SELECT 1 FROM leave_requests l WHERE l.student_id = ra.student_id AND l.status = 'approved' AND l.returned_at IS NULL
                           AND l.from_date <= CURDATE() AND (l.departed_at IS NOT NULL OR l.from_date < CURDATE()))) AS away_on_leave,
              SUM(a.status = 'out_pass') AS out_pass, SUM(a.status = 'absent') AS absent
         FROM room_allocations ra LEFT JOIN attendance a ON a.student_id = ra.student_id AND a.attendance_date = CURDATE()
        WHERE ra.status = 'active' AND ra.hostel_id IN (?)`, [ids]),
    db.query(
      `SELECT lr.id, lr.leave_code, s.name, s.register_number, s.phone, h.code AS hostel_code, r.room_number, lr.destination, lr.from_date, lr.expected_return_at, lr.departed_at
         FROM leave_requests lr JOIN students s ON s.id = lr.student_id JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
         JOIN hostels h ON h.id = ra.hostel_id JOIN rooms r ON r.id = ra.room_id
        WHERE ra.hostel_id IN (?) AND lr.status = 'approved' AND lr.returned_at IS NULL AND lr.from_date <= CURDATE() AND lr.expected_return_at >= NOW()
        ORDER BY lr.expected_return_at`, [ids]),
    db.query(
      `SELECT lr.id, lr.leave_code, s.name, s.register_number, s.phone, p.parent_phone, h.code AS hostel_code, r.room_number, lr.destination,
              lr.expected_return_at, TIMESTAMPDIFF(HOUR, lr.expected_return_at, NOW()) AS hours_overdue
         FROM leave_requests lr JOIN students s ON s.id = lr.student_id JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
         JOIN hostels h ON h.id = ra.hostel_id JOIN rooms r ON r.id = ra.room_id LEFT JOIN student_profiles p ON p.student_id = s.id
        WHERE ra.hostel_id IN (?) AND lr.status = 'approved' AND lr.returned_at IS NULL AND lr.expected_return_at < NOW()
        ORDER BY lr.expected_return_at`, [ids]),
    db.query(
      `SELECT ve.id, ve.pass_code, v.name, v.phone, ve.relationship, ve.entry_time, s.name AS student_name, h.code AS hostel_code,
              TIMESTAMPDIFF(MINUTE, ve.entry_time, NOW()) AS minutes_inside
         FROM visitor_entries ve JOIN visitors v ON v.id = ve.visitor_id JOIN students s ON s.id = ve.student_id JOIN hostels h ON h.id = ve.hostel_id
        WHERE ve.hostel_id IN (?) AND ve.status = 'checked_in' ORDER BY ve.entry_time`, [ids]),
    db.query(
      `SELECT ve.id, ve.pass_code, v.name, v.phone, ve.relationship, ve.expected_at, s.name AS student_name, h.code AS hostel_code
         FROM visitor_entries ve JOIN visitors v ON v.id = ve.visitor_id JOIN students s ON s.id = ve.student_id JOIN hostels h ON h.id = ve.hostel_id
        WHERE ve.hostel_id IN (?) AND ve.status = 'expected' AND (ve.expected_at IS NULL OR DATE(ve.expected_at) <= CURDATE()) ORDER BY ve.expected_at`, [ids]),
    db.query(
      `SELECT lr.id, lr.leave_code, s.name, s.register_number, h.code AS hostel_code, lr.destination, lr.expected_return_at
         FROM leave_requests lr JOIN students s ON s.id = lr.student_id JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
         JOIN hostels h ON h.id = ra.hostel_id
        WHERE ra.hostel_id IN (?) AND lr.status = 'approved' AND lr.departed_at IS NULL AND lr.from_date = CURDATE()`, [ids]),
    db.one(`SELECT COUNT(*) AS today FROM visitor_entries WHERE hostel_id IN (?) AND DATE(entry_time) = CURDATE()`, [ids]),
  ]);
  const residents = Number(presence.residents || 0);
  // Students away = departed on approved leave (incl. overdue ones) + out-pass today.
  const away = Number(presence.away_on_leave || 0) + Number(presence.out_pass || 0);
  ok(res, {
    summary: {
      residents,
      studentsInside: Math.max(0, residents - away),
      studentsOnLeave: onLeave.length,
      studentsOverdue: overdue.length,
      outPass: Number(presence.out_pass || 0),
      visitorsInside: visitorsInside.length,
      visitorsExpected: expected.length,
      visitorsToday: Number(visitorStats.today || 0),
      awayTotal: away,
    },
    onLeave, overdue, visitorsInside, expected, departingToday,
  });
});

/** GET /api/dashboard/staff  my assigned work */
router.get('/staff', async (req, res) => {
  const ids = req.user.hostelIds.length ? req.user.hostelIds : [0];
  const [complaints, maintenance, attendance] = await Promise.all([
    db.query(
      `SELECT c.id, c.complaint_code, c.title, c.priority, c.status, c.sla_due_at, r.room_number, h.code AS hostel_code,
              (c.sla_due_at < NOW()) AS sla_breached
         FROM complaints c JOIN hostels h ON h.id = c.hostel_id LEFT JOIN rooms r ON r.id = c.room_id
        WHERE c.assigned_to = ? AND c.status IN ('assigned','in_progress') ORDER BY c.sla_due_at`, [req.user.id]),
    db.query(
      `SELECT m.id, m.request_code, m.title, m.priority, m.status, r.room_number, h.code AS hostel_code, m.created_at
         FROM maintenance_requests m JOIN hostels h ON h.id = m.hostel_id LEFT JOIN rooms r ON r.id = m.room_id
        WHERE m.status IN ('open','in_progress') AND (m.assigned_to = ? OR (m.assigned_to IS NULL AND m.hostel_id IN (?)))
        ORDER BY FIELD(m.priority,'critical','high','medium','low'), m.created_at`, [req.user.id, ids]),
    db.query(
      `SELECT h.id, h.code, h.name, COUNT(ra.id) AS residents, COUNT(a.id) AS marked
         FROM hostels h LEFT JOIN room_allocations ra ON ra.hostel_id = h.id AND ra.status = 'active'
         LEFT JOIN attendance a ON a.student_id = ra.student_id AND a.attendance_date = CURDATE()
        WHERE h.id IN (?) GROUP BY h.id`, [ids]),
  ]);
  ok(res, { complaints, maintenance, attendance });
});

module.exports = router;
