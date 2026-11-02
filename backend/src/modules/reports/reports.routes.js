const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { notFound } = require('../../utils/AppError');
const { ok } = require('../../utils/respond');
const { toDateStr, addDays } = require('../../utils/helpers');
const { FEE_STATUS_SQL } = require('../fees/fees.service');
const { resolveHostels, kpis } = require('../dashboard/dashboard.service');
const { send, toSummaryPdf } = require('./exporters');

router.use(authenticate, authorize('reports.view'));

const col = (key, label) => ({ key, label });

// Each report: title, columns and a query receiving (hostelIds, from, to, extra filters).
const REPORTS = {
  students: {
    title: 'Student Report',
    description: 'All students with department, academic year and hostel placement',
    columns: [col('register_number', 'Register No'), col('name', 'Name'), col('gender', 'Gender'), col('department', 'Department'), col('degree', 'Degree'),
      col('year_of_study', 'Year'), col('semester', 'Sem'), col('batch', 'Batch'), col('hostel_status', 'Hostel Status'), col('hostel', 'Hostel'), col('bed_code', 'Bed'),
      col('phone', 'Phone'), col('parent_phone', 'Parent Phone'), col('blood_group', 'Blood')],
    query: (ids, f) => db.query(
      `SELECT s.register_number, s.name, s.gender, d.short_name AS department, d.degree, s.year_of_study, s.semester, s.batch, s.hostel_status,
              h.code AS hostel, b.bed_code, s.phone, p.parent_phone, p.blood_group
         FROM students s JOIN departments d ON d.id = s.department_id LEFT JOIN student_profiles p ON p.student_id = s.id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active' LEFT JOIN hostels h ON h.id = ra.hostel_id LEFT JOIN beds b ON b.id = ra.bed_id
        WHERE s.deleted_at IS NULL AND (ra.hostel_id IN (?) OR ra.id IS NULL) ${f.departmentId ? 'AND s.department_id = ?' : ''} ${f.year ? 'AND s.year_of_study = ?' : ''}
        ORDER BY d.short_name, s.year_of_study, s.register_number`, [ids, ...(f.departmentId ? [f.departmentId] : []), ...(f.year ? [f.year] : [])]),
  },
  departments: {
    title: 'Department-wise Hostel Report',
    description: 'Residents, applicants and dues per engineering department',
    columns: [col('code', 'Code'), col('name', 'Department'), col('degree', 'Degree'), col('hod_name', 'HoD'), col('total_students', 'Students'), col('residents', 'Residents'),
      col('year1', '1st Yr'), col('year2', '2nd Yr'), col('year3', '3rd Yr'), col('year4', '4th Yr'), col('pending_admissions', 'Pending Adm.'), col('outstanding', 'Fee Outstanding')],
    query: (ids) => db.query(
      `SELECT d.code, d.name, d.degree, d.hod_name, COUNT(DISTINCT s.id) AS total_students,
              COUNT(DISTINCT IF(ra.hostel_id IN (?), s.id, NULL)) AS residents,
              COUNT(DISTINCT IF(ra.hostel_id IN (?) AND s.year_of_study = 1, s.id, NULL)) AS year1,
              COUNT(DISTINCT IF(ra.hostel_id IN (?) AND s.year_of_study = 2, s.id, NULL)) AS year2,
              COUNT(DISTINCT IF(ra.hostel_id IN (?) AND s.year_of_study = 3, s.id, NULL)) AS year3,
              COUNT(DISTINCT IF(ra.hostel_id IN (?) AND s.year_of_study = 4, s.id, NULL)) AS year4,
              COUNT(DISTINCT IF(s.hostel_status IN ('applied','approved'), s.id, NULL)) AS pending_admissions,
              (SELECT COALESCE(SUM(sf.total_amount - sf.discount - sf.amount_paid),0) FROM student_fees sf JOIN students s2 ON s2.id = sf.student_id
                WHERE s2.department_id = d.id AND sf.waived = 0) AS outstanding
         FROM departments d LEFT JOIN students s ON s.department_id = d.id AND s.deleted_at IS NULL
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        GROUP BY d.id ORDER BY d.degree, d.code`, [ids, ids, ids, ids, ids]),
  },
  occupancy: {
    title: 'Hostel Occupancy Report',
    description: 'Beds by status per hostel and floor',
    columns: [col('hostel', 'Hostel'), col('floor', 'Floor'), col('rooms', 'Rooms'), col('beds', 'Beds'), col('occupied', 'Occupied'), col('available', 'Available'),
      col('reserved', 'Reserved'), col('unavailable', 'Maint./Blocked'), col('occupancy', 'Occupancy %')],
    query: (ids) => db.query(
      `SELECT h.name AS hostel, f.label AS floor, COUNT(DISTINCT r.id) AS rooms, COUNT(b.id) AS beds, SUM(b.status = 'occupied') AS occupied,
              SUM(b.status = 'available' AND r.status = 'active') AS available, SUM(b.status = 'reserved') AS reserved,
              SUM(b.status IN ('maintenance','blocked') OR (b.status = 'available' AND r.status <> 'active')) AS unavailable,
              ROUND(100 * SUM(b.status = 'occupied') / NULLIF(SUM(b.status IN ('occupied','available','reserved')), 0), 1) AS occupancy
         FROM hostels h JOIN floors f ON f.hostel_id = h.id JOIN rooms r ON r.floor_id = f.id AND r.deleted_at IS NULL JOIN beds b ON b.room_id = r.id
        WHERE h.id IN (?) GROUP BY h.id, f.id ORDER BY h.code, f.floor_number`, [ids]),
  },
  allocations: {
    title: 'Room Allocation Report',
    description: 'Allocation records (active, transferred and vacated) in the period',
    columns: [col('register_number', 'Register No'), col('name', 'Student'), col('department', 'Dept'), col('hostel', 'Hostel'), col('bed_code', 'Bed'),
      col('status', 'Status'), col('allocated_at', 'Allocated'), col('ended_at', 'Ended'), col('end_reason', 'End Reason'), col('allocated_by', 'By')],
    query: (ids, f) => db.query(
      `SELECT s.register_number, s.name, d.short_name AS department, h.code AS hostel, b.bed_code, ra.status, ra.allocated_at, ra.ended_at, ra.end_reason, u.name AS allocated_by
         FROM room_allocations ra JOIN students s ON s.id = ra.student_id JOIN departments d ON d.id = s.department_id JOIN hostels h ON h.id = ra.hostel_id
         JOIN beds b ON b.id = ra.bed_id LEFT JOIN users u ON u.id = ra.allocated_by
        WHERE ra.hostel_id IN (?) AND (ra.status = 'active' OR ra.allocated_at BETWEEN ? AND ? OR ra.ended_at BETWEEN ? AND ?)
        ORDER BY ra.allocated_at DESC`, [ids, f.from, `${f.to} 23:59:59`, f.from, `${f.to} 23:59:59`]),
  },
  attendance: {
    title: 'Attendance Report',
    description: 'Per-student attendance summary for the period',
    columns: [col('register_number', 'Register No'), col('name', 'Student'), col('department', 'Dept'), col('hostel', 'Hostel'), col('room_number', 'Room'),
      col('present', 'Present'), col('late', 'Late'), col('absent', 'Absent'), col('on_leave', 'On Leave'), col('out_pass', 'Out Pass'), col('percentage', 'Attendance %')],
    query: (ids, f) => db.query(
      `SELECT s.register_number, s.name, d.short_name AS department, h.code AS hostel, r.room_number,
              SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late, SUM(a.status = 'absent') AS absent,
              SUM(a.status = 'on_leave') AS on_leave, SUM(a.status = 'out_pass') AS out_pass,
              ROUND(100 * SUM(a.status IN ('present','late')) / NULLIF(SUM(a.status IN ('present','late','absent')),0), 1) AS percentage
         FROM attendance a JOIN students s ON s.id = a.student_id JOIN departments d ON d.id = s.department_id JOIN hostels h ON h.id = a.hostel_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active' LEFT JOIN rooms r ON r.id = ra.room_id
        WHERE a.hostel_id IN (?) AND a.attendance_date BETWEEN ? AND ?
        GROUP BY s.id, h.code, r.room_number ORDER BY percentage, s.name`, [ids, f.from, f.to]),
  },
  leaves: {
    title: 'Leave Report',
    description: 'Leave requests overlapping the period',
    columns: [col('leave_code', 'Leave'), col('register_number', 'Register No'), col('name', 'Student'), col('leave_type', 'Type'), col('from_date', 'From'), col('to_date', 'To'),
      col('destination', 'Destination'), col('status', 'Status'), col('expected_return_at', 'Expected Return'), col('returned_at', 'Returned'), col('reviewed_by', 'Reviewed By')],
    query: (ids, f) => db.query(
      `SELECT lr.leave_code, s.register_number, s.name, lr.leave_type, lr.from_date, lr.to_date, lr.destination, lr.status, lr.expected_return_at, lr.returned_at, u.name AS reviewed_by
         FROM leave_requests lr JOIN students s ON s.id = lr.student_id JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
         LEFT JOIN users u ON u.id = lr.reviewed_by
        WHERE ra.hostel_id IN (?) AND lr.from_date <= ? AND lr.to_date >= ? ORDER BY lr.from_date DESC`, [ids, f.to, f.from]),
  },
  complaints: {
    title: 'Complaint Report',
    description: 'Complaints raised in the period with SLA performance',
    columns: [col('complaint_code', 'Code'), col('created_at', 'Raised'), col('hostel', 'Hostel'), col('room_number', 'Room'), col('category', 'Category'), col('priority', 'Priority'),
      col('title', 'Title'), col('status', 'Status'), col('assigned_to', 'Assigned To'), col('sla_due_at', 'SLA Due'), col('resolved_at', 'Resolved'), col('sla', 'SLA'), col('student_rating', 'Rating')],
    query: (ids, f) => db.query(
      `SELECT c.complaint_code, c.created_at, h.code AS hostel, r.room_number, c.category, c.priority, c.title, c.status, u.name AS assigned_to, c.sla_due_at, c.resolved_at,
              CASE WHEN c.resolved_at IS NOT NULL THEN IF(c.resolved_at <= c.sla_due_at, 'Met', 'Missed')
                   WHEN c.status IN ('pending','assigned','in_progress') THEN IF(c.sla_due_at < NOW(), 'Breached', 'On track') ELSE '-' END AS sla,
              c.student_rating
         FROM complaints c JOIN hostels h ON h.id = c.hostel_id LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN users u ON u.id = c.assigned_to
        WHERE c.hostel_id IN (?) AND c.created_at BETWEEN ? AND ? ORDER BY c.created_at DESC`, [ids, f.from, `${f.to} 23:59:59`]),
  },
  maintenance: {
    title: 'Maintenance Report',
    description: 'Maintenance requests created in the period',
    columns: [col('request_code', 'Code'), col('created_at', 'Created'), col('hostel', 'Hostel'), col('room_number', 'Room'), col('category', 'Category'), col('priority', 'Priority'),
      col('title', 'Title'), col('status', 'Status'), col('assigned_to', 'Assigned'), col('completed_at', 'Completed'), col('cost', 'Cost')],
    query: (ids, f) => db.query(
      `SELECT m.request_code, m.created_at, h.code AS hostel, r.room_number, m.category, m.priority, m.title, m.status, u.name AS assigned_to, m.completed_at, m.cost
         FROM maintenance_requests m JOIN hostels h ON h.id = m.hostel_id LEFT JOIN rooms r ON r.id = m.room_id LEFT JOIN users u ON u.id = m.assigned_to
        WHERE m.hostel_id IN (?) AND m.created_at BETWEEN ? AND ? ORDER BY m.created_at DESC`, [ids, f.from, `${f.to} 23:59:59`]),
  },
  fees: {
    title: 'Fee Collection Report',
    description: 'Fee ledger with paid, outstanding and status per student',
    columns: [col('register_number', 'Register No'), col('name', 'Student'), col('department', 'Dept'), col('hostel', 'Hostel'), col('fee_name', 'Fee'), col('academic_year', 'Year'),
      col('net', 'Net Amount'), col('paid', 'Paid'), col('balance', 'Balance'), col('due_date', 'Due'), col('status', 'Status')],
    query: (ids, f) => db.query(
      `SELECT s.register_number, s.name, d.short_name AS department, h.code AS hostel, fs.name AS fee_name, sf.academic_year,
              (sf.total_amount - sf.discount) AS net, sf.amount_paid AS paid, (sf.total_amount - sf.discount - sf.amount_paid) AS balance, sf.due_date, ${FEE_STATUS_SQL} AS status
         FROM student_fees sf JOIN students s ON s.id = sf.student_id JOIN departments d ON d.id = s.department_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active' LEFT JOIN hostels h ON h.id = ra.hostel_id
        WHERE (ra.hostel_id IN (?) OR ra.id IS NULL) ${f.status ? `AND ${FEE_STATUS_SQL} = ?` : ''}
        ORDER BY FIELD(${FEE_STATUS_SQL},'overdue','partial','pending','paid','waived'), sf.due_date`, [ids, ...(f.status ? [f.status] : [])]),
  },
  payments: {
    title: 'Payment Collection Report',
    description: 'Payments received in the period',
    columns: [col('receipt_number', 'Receipt'), col('paid_at', 'Date'), col('register_number', 'Register No'), col('name', 'Student'), col('fee_name', 'Fee'),
      col('payment_mode', 'Mode'), col('transaction_id', 'Txn ID'), col('amount', 'Amount'), col('recorded_by', 'Recorded By')],
    query: (ids, f) => db.query(
      `SELECT p.receipt_number, p.paid_at, s.register_number, s.name, fs.name AS fee_name, p.payment_mode, p.transaction_id, p.amount, u.name AS recorded_by
         FROM payments p JOIN students s ON s.id = p.student_id JOIN student_fees sf ON sf.id = p.student_fee_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id
         LEFT JOIN users u ON u.id = p.recorded_by LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        WHERE (ra.hostel_id IN (?) OR ra.id IS NULL) AND p.paid_at BETWEEN ? AND ? ORDER BY p.paid_at DESC`, [ids, f.from, `${f.to} 23:59:59`]),
  },
  visitors: {
    title: 'Visitor Report',
    description: 'Visitor register for the period',
    columns: [col('pass_code', 'Pass'), col('visitor', 'Visitor'), col('phone', 'Phone'), col('relationship', 'Relation'), col('student', 'Student'), col('hostel', 'Hostel'),
      col('purpose', 'Purpose'), col('status', 'Status'), col('entry_time', 'Entry'), col('exit_time', 'Exit'), col('minutes', 'Minutes')],
    query: (ids, f) => db.query(
      `SELECT ve.pass_code, v.name AS visitor, v.phone, ve.relationship, s.name AS student, h.code AS hostel, ve.purpose, ve.status, ve.entry_time, ve.exit_time,
              TIMESTAMPDIFF(MINUTE, ve.entry_time, ve.exit_time) AS minutes
         FROM visitor_entries ve JOIN visitors v ON v.id = ve.visitor_id JOIN students s ON s.id = ve.student_id JOIN hostels h ON h.id = ve.hostel_id
        WHERE ve.hostel_id IN (?) AND COALESCE(ve.entry_time, ve.expected_at, ve.created_at) BETWEEN ? AND ? ORDER BY ve.created_at DESC`, [ids, f.from, `${f.to} 23:59:59`]),
  },
  exits: {
    title: 'Hostel Exit Report',
    description: 'Exit requests and clearances in the period',
    columns: [col('register_number', 'Register No'), col('name', 'Student'), col('bed_code', 'Bed'), col('reason', 'Reason'), col('requested_exit_date', 'Requested'), col('exit_date', 'Exit Date'),
      col('room_condition', 'Room Condition'), col('pending_fees', 'Pending Fees'), col('damage_charges', 'Damages'), col('clearance_status', 'Clearance'), col('approved_by', 'Approved By')],
    query: (ids, f) => db.query(
      `SELECT s.register_number, s.name, b.bed_code, e.reason, e.requested_exit_date, e.exit_date, e.room_condition, e.pending_fees, e.damage_charges, e.clearance_status, u.name AS approved_by
         FROM hostel_exit_records e JOIN students s ON s.id = e.student_id JOIN room_allocations ra ON ra.id = e.allocation_id JOIN beds b ON b.id = ra.bed_id
         LEFT JOIN users u ON u.id = e.approved_by
        WHERE ra.hostel_id IN (?) AND e.created_at BETWEEN ? AND ? ORDER BY e.created_at DESC`, [ids, f.from, `${f.to} 23:59:59`]),
  },
};

const filters = z.object({
  format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
  hostelId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1).max(5).optional(),
  status: z.string().max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** GET /api/reports  available report types */
router.get('/', (_req, res) => ok(res, [
  { key: 'daily-status', title: 'Daily Hostel Status', description: 'One-page operational summary for the start/end of the day' },
  ...Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, description: r.description })),
]));

/** GET /api/reports/daily-status?date&hostelId&format=json|pdf */
router.get('/daily-status', async (req, res) => {
  const f = filters.parse(req.query);
  const date = f.date || toDateStr();
  const ids = await resolveHostels(req.user, f.hostelId);
  const hostels = await db.query('SELECT name FROM hostels WHERE id IN (?) ORDER BY code', [ids]);
  const k = await kpis(ids);
  // KPIs are live; when a past date is requested, attendance figures come from that day's register.
  if (date !== toDateStr()) {
    const a = await db.one(
      `SELECT SUM(status IN ('present','late')) AS present, SUM(status = 'absent') AS absent, SUM(status = 'on_leave') AS on_leave
         FROM attendance WHERE hostel_id IN (?) AND attendance_date = ?`, [ids, date]);
    Object.assign(k, { presentToday: Number(a.present || 0), absentToday: Number(a.absent || 0), onLeave: Number(a.on_leave || 0) });
  }
  const sections = [
    { title: 'Residents', items: [['Students in hostel', k.students], ['Present', k.presentToday], ['On leave', k.onLeave], ['Absent', k.absentToday, k.absentToday > 0], ['Attendance not marked', k.notMarked, k.notMarked > 0]] },
    { title: 'Rooms', items: [['Occupancy', `${k.occupancy}%`], ['Available beds', k.availableBeds], ['Rooms under maintenance', k.maintenanceRooms, k.maintenanceRooms > 0]] },
    { title: 'Security', items: [['Visitors inside now', k.visitorsInside], ['Visitors today', k.visitorsToday], ['Overdue leave returns', k.overdueReturns, k.overdueReturns > 0]] },
    { title: 'Operations', items: [['Open complaints', k.openComplaints], ['SLA breached', k.slaBreached, k.slaBreached > 0], ['Resolved today', k.resolvedToday], ['Pending leave approvals', k.pendingLeaves], ['Open maintenance', k.openMaintenance]] },
    { title: 'Fees', items: [['Overdue fee records', k.feeOverdue, k.feeOverdue > 0], ['Overdue amount', `₹${k.feeOverdueAmount.toLocaleString('en-IN')}`, k.feeOverdueAmount > 0], ['Collection rate', `${k.feeCollectionRate}%`]] },
  ];
  if (f.format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="daily-status-${date}.pdf"`);
    return res.send(await toSummaryPdf('HOSTEL DAILY STATUS', sections.map((s) => ({ ...s, items: s.items.map(([l, v, flag]) => [l, String(v).replace('₹', 'Rs. '), flag]) })),
      [`Date: ${date}`, `Hostels: ${hostels.map((h) => h.name).join(', ')}`, `Generated by ${req.user.name}`]));
  }
  ok(res, { date, hostels: hostels.map((h) => h.name), kpis: k, sections });
});

/** GET /api/reports/:type?format=json|csv|xlsx|pdf&hostelId&from&to&departmentId&year&status */
router.get('/:type', async (req, res) => {
  const report = REPORTS[req.params.type];
  if (!report) throw notFound('Report');
  const f = filters.parse(req.query);
  f.to = f.to || toDateStr();
  f.from = f.from || addDays(f.to, -29);
  const ids = await resolveHostels(req.user, f.hostelId);
  const rows = await report.query(ids, f);
  const meta = [`Period: ${f.from} to ${f.to}`, `Generated by ${req.user.name}`, `${rows.length} record(s)`];
  if (f.format !== 'json') {
    return send(res, f.format, { filename: `${req.params.type}-report-${f.to}`, title: report.title, columns: report.columns, rows, meta });
  }
  ok(res, { title: report.title, columns: report.columns, rows, meta, from: f.from, to: f.to });
});

module.exports = router;
