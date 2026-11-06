const db = require('../../config/db');
const { pct, toDateStr } = require('../../utils/helpers');
const { FEE_STATUS_SQL } = require('../fees/fees.service');

// Shared student overview used by the student 360 view and the student dashboard.
async function studentOverview(studentId) {
  const student = await db.one(
    `SELECT s.*, d.code AS department_code, d.name AS department_name, d.short_name AS department_short, d.degree,
            d.hod_name, d.block AS department_block,
            p.parent_name, p.parent_relation, p.parent_phone, p.parent_email, p.parent_occupation,
            p.emergency_contact_name, p.emergency_contact_phone, p.address_line, p.city, p.district, p.state, p.pincode,
            p.blood_group, p.medical_notes, p.faculty_advisor, p.cgpa, p.scholarship, p.first_graduate, p.distance_from_home_km,
            u.status AS account_status, u.last_login_at
       FROM students s
       JOIN departments d ON d.id = s.department_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN student_profiles p ON p.student_id = s.id
      WHERE s.id = ? AND s.deleted_at IS NULL`, [studentId]);
  if (!student) return null;

  const monthStart = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const [allocation, application, fees, attendance, leaves, complaints, transfers, exitRecord, visitors, cbseDetails] = await Promise.all([
    db.one(
      `SELECT ra.id, ra.allocated_at, ra.academic_year, b.id AS bed_id, b.bed_code, b.bed_number, r.id AS room_id, r.room_number, r.room_type,
              r.is_ac, r.attached_bath, r.status AS room_status, f.floor_number, f.label AS floor_label,
              h.id AS hostel_id, h.name AS hostel_name, h.code AS hostel_code, w.name AS warden_name, w.phone AS warden_phone,
              (SELECT GROUP_CONCAT(s2.name ORDER BY b2.bed_number SEPARATOR ', ') FROM room_allocations ra2
                 JOIN students s2 ON s2.id = ra2.student_id JOIN beds b2 ON b2.id = ra2.bed_id
                WHERE ra2.room_id = ra.room_id AND ra2.status = 'active' AND ra2.student_id <> ra.student_id) AS roommates
         FROM room_allocations ra JOIN beds b ON b.id = ra.bed_id JOIN rooms r ON r.id = ra.room_id
         JOIN floors f ON f.id = r.floor_id JOIN hostels h ON h.id = ra.hostel_id LEFT JOIN users w ON w.id = h.warden_id
        WHERE ra.student_id = ? AND ra.status = 'active'`, [studentId]),
    db.one(
      `SELECT a.id, a.application_code, a.academic_year, a.status, a.remarks, a.created_at, h.name AS preferred_hostel
         FROM hostel_applications a LEFT JOIN hostels h ON h.id = a.preferred_hostel_id
        WHERE a.student_id = ? ORDER BY a.created_at DESC LIMIT 1`, [studentId]),
    db.query(
      `SELECT sf.id, sf.academic_year, fs.name AS fee_name, fs.hostel_fee, fs.mess_fee, fs.maintenance_fee, fs.security_deposit, fs.other_fee,
              sf.total_amount, sf.discount, sf.amount_paid, (sf.total_amount - sf.discount - sf.amount_paid) AS balance, sf.due_date,
              ${FEE_STATUS_SQL} AS status
         FROM student_fees sf JOIN fee_structures fs ON fs.id = sf.fee_structure_id
        WHERE sf.student_id = ? ORDER BY sf.due_date DESC`, [studentId]),
    db.one(
      `SELECT COUNT(*) AS marked, SUM(status = 'present') AS present, SUM(status = 'late') AS late, SUM(status = 'absent') AS absent,
              SUM(status = 'on_leave') AS on_leave, SUM(status = 'out_pass') AS out_pass
         FROM attendance WHERE student_id = ? AND attendance_date >= ?`, [studentId, monthStart]),
    db.query(
      `SELECT id, leave_code, leave_type, from_date, to_date, expected_return_at, status, destination, returned_at, created_at,
              (status = 'approved' AND returned_at IS NULL AND expected_return_at < NOW()) AS overdue
         FROM leave_requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`, [studentId]),
    db.query(
      `SELECT id, complaint_code, title, category, priority, status, sla_due_at, created_at,
              (status IN ('pending','assigned','in_progress') AND sla_due_at < NOW()) AS sla_breached
         FROM complaints WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`, [studentId]),
    db.query(
      `SELECT t.id, t.reason, t.created_at, fb.bed_code AS from_bed, tb.bed_code AS to_bed, u.name AS transferred_by
         FROM room_transfer_history t JOIN beds fb ON fb.id = t.from_bed_id JOIN beds tb ON tb.id = t.to_bed_id
         LEFT JOIN users u ON u.id = t.transferred_by WHERE t.student_id = ? ORDER BY t.created_at DESC`, [studentId]),
    db.one(`SELECT * FROM hostel_exit_records WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`, [studentId]),
    db.query(
      `SELECT ve.id, ve.pass_code, v.name, ve.relationship, ve.status, ve.expected_at, ve.entry_time, ve.exit_time
         FROM visitor_entries ve JOIN visitors v ON v.id = ve.visitor_id WHERE ve.student_id = ? ORDER BY ve.created_at DESC LIMIT 10`, [studentId]),
    db.one(`SELECT * FROM student_cbse_details WHERE student_id = ?`, [studentId]),
  ]);

  const counted = (attendance.marked || 0) - (attendance.on_leave || 0) - (attendance.out_pass || 0);
  const feeTotals = fees.reduce((acc, f) => ({
    total: acc.total + f.total_amount - f.discount,
    paid: acc.paid + f.amount_paid,
    due: acc.due + (f.status === 'waived' ? 0 : f.balance),
  }), { total: 0, paid: 0, due: 0 });

  return {
    student,
    cbseDetails: cbseDetails || null,
    allocation,
    application,
    fees: { items: fees, ...feeTotals, overdue: fees.some((f) => f.status === 'overdue') },
    attendance: {
      ...attendance,
      percentage: pct((attendance.present || 0) + (attendance.late || 0), counted),
      since: monthStart,
    },
    leaves,
    complaints,
    transfers,
    exitRecord,
    visitors,
  };
}

module.exports = { studentOverview };
