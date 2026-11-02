// Hostel Health Score: an operational indicator (not a disciplinary score) built from six signals.
const db = require('../../config/db');
const { pct, round, toDateStr, addDays } = require('../../utils/helpers');

const WEIGHTS = { attendance: 0.25, complaintSla: 0.2, feeCollection: 0.2, maintenance: 0.15, occupancy: 0.1, leaveCompliance: 0.1 };

async function hostelHealth(hostelId) {
  const today = toDateStr();
  const [att, cmp, fee, rooms, maint, beds, leave] = await Promise.all([
    db.one(
      `SELECT SUM(status IN ('present','late')) AS ok, SUM(status IN ('present','late','absent')) AS counted
         FROM attendance WHERE hostel_id = ? AND attendance_date BETWEEN ? AND ?`, [hostelId, addDays(today, -6), today]),
    db.one(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN ('resolved','closed') THEN resolved_at <= sla_due_at
                       WHEN status IN ('pending','assigned','in_progress') THEN sla_due_at >= NOW() ELSE 1 END) AS within
         FROM complaints WHERE hostel_id = ? AND created_at >= NOW() - INTERVAL 30 DAY AND status <> 'rejected'`, [hostelId]),
    db.one(
      `SELECT COALESCE(SUM(sf.total_amount - sf.discount),0) AS billed, COALESCE(SUM(sf.amount_paid),0) AS paid
         FROM student_fees sf JOIN room_allocations ra ON ra.student_id = sf.student_id AND ra.status = 'active'
        WHERE ra.hostel_id = ? AND sf.waived = 0 AND sf.due_date <= CURDATE()`, [hostelId]),
    db.one(`SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM rooms WHERE hostel_id = ? AND status <> 'inactive' AND deleted_at IS NULL`, [hostelId]),
    db.one(`SELECT COUNT(*) AS stale FROM maintenance_requests WHERE hostel_id = ? AND status IN ('open','in_progress') AND created_at < NOW() - INTERVAL 3 DAY`, [hostelId]),
    db.one(
      `SELECT SUM(b.status = 'occupied') AS occupied, SUM(b.status IN ('occupied','available','reserved')) AS usable
         FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = ? AND r.status = 'active' AND r.deleted_at IS NULL`, [hostelId]),
    db.one(
      `SELECT COUNT(*) AS active, SUM(lr.expected_return_at < NOW()) AS overdue
         FROM leave_requests lr JOIN room_allocations ra ON ra.student_id = lr.student_id AND ra.status = 'active'
        WHERE ra.hostel_id = ? AND lr.status = 'approved' AND lr.returned_at IS NULL AND lr.from_date <= CURDATE()`, [hostelId]),
  ]);

  const components = {
    attendance: att.counted ? pct(Number(att.ok), Number(att.counted)) : 100,
    complaintSla: cmp.total ? pct(Number(cmp.within), Number(cmp.total)) : 100,
    feeCollection: fee.billed ? pct(Number(fee.paid), Number(fee.billed)) : 100,
    maintenance: rooms.total ? Math.max(0, round(pct(Number(rooms.active), Number(rooms.total)) - 5 * Number(maint.stale))) : 100,
    occupancy: beds.usable ? pct(Number(beds.occupied), Number(beds.usable)) : 0,
    leaveCompliance: leave.active ? pct(Number(leave.active) - Number(leave.overdue || 0), Number(leave.active)) : 100,
  };
  const score = round(Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + components[k] * w, 0));
  return { score, components, weights: WEIGHTS, band: score >= 85 ? 'good' : score >= 70 ? 'fair' : 'attention' };
}

module.exports = { hostelHealth, WEIGHTS };
