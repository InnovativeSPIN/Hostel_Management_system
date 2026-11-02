const db = require('../../config/db');
const { pct, toDateStr, addDays } = require('../../utils/helpers');
const { forbidden } = require('../../utils/AppError');
const { getNumber } = require('../../services/settings');
const { FEE_STATUS_SQL } = require('../fees/fees.service');
const { hostelHealth } = require('./health.service');

// Resolves which hostels the dashboard covers (optionally narrowed by ?hostelId).
async function resolveHostels(user, hostelId) {
  let ids;
  if (user.role === 'super_admin') ids = (await db.query('SELECT id FROM hostels WHERE deleted_at IS NULL')).map((h) => h.id);
  else ids = [...user.hostelIds];
  if (hostelId) {
    if (!ids.includes(Number(hostelId))) throw forbidden('Hostel outside your scope');
    ids = [Number(hostelId)];
  }
  return ids.length ? ids : [0];
}

async function kpis(ids) {
  const today = toDateStr();
  const soon = await getNumber('fee_due_soon_days');
  const [beds, att, leave, vis, cmp, fees, maint, apps, exits] = await Promise.all([
    db.one(
      `SELECT COUNT(DISTINCT r.id) AS total_rooms, COUNT(b.id) AS total_beds, SUM(b.status = 'occupied') AS occupied,
              SUM(b.status = 'available' AND r.status = 'active') AS available, SUM(b.status = 'reserved') AS reserved,
              SUM(b.status IN ('maintenance','blocked') OR (b.status = 'available' AND r.status <> 'active')) AS unavailable,
              COUNT(DISTINCT IF(r.status = 'maintenance', r.id, NULL)) AS maintenance_rooms
         FROM rooms r JOIN beds b ON b.room_id = r.id WHERE r.hostel_id IN (?) AND r.deleted_at IS NULL AND r.status <> 'inactive'`, [ids]),
    db.one(
      `SELECT COUNT(*) AS residents, SUM(a.status IN ('present','late')) AS present, SUM(a.status = 'absent') AS absent,
              SUM(a.status = 'late') AS late, SUM(a.status = 'out_pass') AS out_pass, SUM(a.id IS NULL) AS not_marked
         FROM room_allocations ra LEFT JOIN attendance a ON a.student_id = ra.student_id AND a.attendance_date = ?
        WHERE ra.status = 'active' AND ra.hostel_id IN (?)`, [today, ids]),
    db.one(
      `SELECT SUM(lr.status = 'pending') AS pending,
              SUM(lr.status = 'approved' AND lr.returned_at IS NULL AND lr.from_date <= CURDATE()) AS on_leave,
              SUM(lr.status = 'approved' AND lr.returned_at IS NULL AND lr.expected_return_at < NOW()) AS overdue_returns
         FROM leave_requests lr JOIN room_allocations ra ON ra.student_id = lr.student_id AND ra.status = 'active' WHERE ra.hostel_id IN (?)`, [ids]),
    db.one(
      `SELECT SUM(status = 'checked_in') AS inside, SUM(status = 'expected' AND (expected_at IS NULL OR DATE(expected_at) = CURDATE())) AS expected,
              SUM(DATE(COALESCE(entry_time, created_at)) = CURDATE() AND status IN ('checked_in','checked_out')) AS today
         FROM visitor_entries WHERE hostel_id IN (?)`, [ids]),
    db.one(
      `SELECT SUM(status IN ('pending','assigned','in_progress')) AS open,
              SUM(status IN ('pending','assigned','in_progress') AND sla_due_at < NOW()) AS breached,
              SUM(status IN ('pending','assigned','in_progress') AND sla_due_at BETWEEN NOW() AND CONCAT(CURDATE(), ' 23:59:59')) AS due_today,
              SUM(status IN ('resolved','closed') AND DATE(resolved_at) = CURDATE()) AS resolved_today,
              SUM(status = 'pending') AS unassigned
         FROM complaints WHERE hostel_id IN (?)`, [ids]),
    db.one(
      `SELECT SUM(${FEE_STATUS_SQL} = 'overdue') AS overdue, SUM(IF(${FEE_STATUS_SQL} = 'overdue', sf.total_amount - sf.discount - sf.amount_paid, 0)) AS overdue_amount,
              SUM(${FEE_STATUS_SQL} IN ('pending','partial') AND sf.due_date <= CURDATE() + INTERVAL ? DAY) AS due_soon,
              SUM(${FEE_STATUS_SQL} = 'partial') AS partial,
              SUM(sf.amount_paid) AS collected, SUM(IF(sf.waived = 0, sf.total_amount - sf.discount - sf.amount_paid, 0)) AS outstanding,
              SUM(sf.total_amount - sf.discount) AS billed
         FROM student_fees sf JOIN room_allocations ra ON ra.student_id = sf.student_id AND ra.status = 'active' WHERE ra.hostel_id IN (?)`, [soon, ids]),
    db.one(`SELECT COUNT(*) AS open, SUM(created_at < NOW() - INTERVAL 3 DAY) AS stale FROM maintenance_requests WHERE status IN ('open','in_progress') AND hostel_id IN (?)`, [ids]),
    db.one(
      `SELECT SUM(status IN ('submitted','documents_verified','eligible')) AS pending_review, SUM(status IN ('approved','fee_assigned')) AS awaiting_allocation,
              SUM(status = 'allocated') AS awaiting_confirmation
         FROM hostel_applications WHERE (preferred_hostel_id IN (?) OR preferred_hostel_id IS NULL)`, [ids]),
    db.one(
      `SELECT COUNT(*) AS pending FROM hostel_exit_records e JOIN room_allocations ra ON ra.id = e.allocation_id
        WHERE e.clearance_status IN ('requested','inspected') AND ra.hostel_id IN (?)`, [ids]),
  ]);
  const n = (v) => Number(v || 0);
  const usable = n(beds.occupied) + n(beds.available) + n(beds.reserved);
  return {
    students: n(att.residents),
    totalRooms: n(beds.total_rooms), totalBeds: n(beds.total_beds), occupiedBeds: n(beds.occupied), availableBeds: n(beds.available),
    unavailableBeds: n(beds.unavailable), maintenanceRooms: n(beds.maintenance_rooms),
    occupancy: pct(n(beds.occupied), usable),
    presentToday: n(att.present), absentToday: n(att.absent), lateToday: n(att.late), notMarked: n(att.not_marked),
    attendanceToday: pct(n(att.present), n(att.present) + n(att.absent)),
    onLeave: n(leave.on_leave), pendingLeaves: n(leave.pending), overdueReturns: n(leave.overdue_returns),
    visitorsInside: n(vis.inside), visitorsExpected: n(vis.expected), visitorsToday: n(vis.today),
    openComplaints: n(cmp.open), slaBreached: n(cmp.breached), complaintsDueToday: n(cmp.due_today), resolvedToday: n(cmp.resolved_today), unassignedComplaints: n(cmp.unassigned),
    feeOverdue: n(fees.overdue), feeOverdueAmount: n(fees.overdue_amount), feeDueSoon: n(fees.due_soon), feePartial: n(fees.partial),
    feeCollected: n(fees.collected), feeOutstanding: n(fees.outstanding), feeBilled: n(fees.billed), feeCollectionRate: pct(n(fees.collected), n(fees.billed)),
    openMaintenance: n(maint.open), staleMaintenance: n(maint.stale),
    pendingApplications: n(apps.pending_review), awaitingAllocation: n(apps.awaiting_allocation), awaitingConfirmation: n(apps.awaiting_confirmation),
    pendingExits: n(exits.pending),
  };
}

/** Action Center: concrete records needing attention, most urgent first, each with a deep link. */
async function actionItems(ids, limit = 40) {
  const repeatN = await getNumber('repeated_absence_count');
  const [sla, critical, overdue, leaves, apps, alloc, maint, visitors, absences, exits, fees] = await Promise.all([
    db.query(
      `SELECT id, complaint_code, title, priority, sla_due_at, TIMESTAMPDIFF(HOUR, sla_due_at, NOW()) AS hours_over, escalation_level
         FROM complaints WHERE hostel_id IN (?) AND status IN ('pending','assigned','in_progress') AND sla_due_at < NOW()
        ORDER BY FIELD(priority,'critical','high','medium','low'), sla_due_at LIMIT 15`, [ids]),
    db.query(`SELECT id, complaint_code, title, priority FROM complaints WHERE hostel_id IN (?) AND status = 'pending' AND sla_due_at >= NOW() ORDER BY FIELD(priority,'critical','high','medium','low') LIMIT 10`, [ids]),
    db.query(
      `SELECT lr.id, lr.leave_code, s.id AS student_id, s.name, s.register_number, lr.expected_return_at, TIMESTAMPDIFF(HOUR, lr.expected_return_at, NOW()) AS hours_over
         FROM leave_requests lr JOIN students s ON s.id = lr.student_id JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        WHERE ra.hostel_id IN (?) AND lr.status = 'approved' AND lr.returned_at IS NULL AND lr.expected_return_at < NOW() ORDER BY lr.expected_return_at LIMIT 15`, [ids]),
    db.query(
      `SELECT lr.id, lr.leave_code, s.name, lr.from_date, lr.leave_type FROM leave_requests lr JOIN room_allocations ra ON ra.student_id = lr.student_id AND ra.status = 'active'
         JOIN students s ON s.id = lr.student_id WHERE ra.hostel_id IN (?) AND lr.status = 'pending' ORDER BY lr.from_date LIMIT 15`, [ids]),
    db.query(
      `SELECT a.id, a.application_code, a.status, s.name FROM hostel_applications a JOIN students s ON s.id = a.student_id
        WHERE (a.preferred_hostel_id IN (?) OR a.preferred_hostel_id IS NULL) AND a.status IN ('submitted','documents_verified','eligible') ORDER BY a.created_at LIMIT 10`, [ids]),
    db.query(
      `SELECT a.id, a.application_code, s.id AS student_id, s.name FROM hostel_applications a JOIN students s ON s.id = a.student_id
        WHERE (a.preferred_hostel_id IN (?) OR a.preferred_hostel_id IS NULL) AND a.status IN ('approved','fee_assigned')
          AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.student_id = s.id AND ra.status = 'active') LIMIT 10`, [ids]),
    db.query(
      `SELECT m.id, m.request_code, m.title, m.priority, r.room_number, DATEDIFF(NOW(), m.created_at) AS age_days, m.blocks_room
         FROM maintenance_requests m LEFT JOIN rooms r ON r.id = m.room_id
        WHERE m.hostel_id IN (?) AND m.status IN ('open','in_progress') AND (m.created_at < NOW() - INTERVAL 2 DAY OR m.priority IN ('high','critical') OR m.blocks_room = 1)
        ORDER BY FIELD(m.priority,'critical','high','medium','low'), m.created_at LIMIT 10`, [ids]),
    db.query(
      `SELECT ve.id, ve.pass_code, v.name, TIMESTAMPDIFF(MINUTE, ve.entry_time, NOW()) AS minutes FROM visitor_entries ve JOIN visitors v ON v.id = ve.visitor_id
        WHERE ve.hostel_id IN (?) AND ve.status = 'checked_in' AND ve.entry_time < NOW() - INTERVAL 3 HOUR LIMIT 10`, [ids]),
    db.query(
      `SELECT s.id AS student_id, s.name, s.register_number, COUNT(*) AS absences FROM attendance a JOIN students s ON s.id = a.student_id
         JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        WHERE ra.hostel_id IN (?) AND a.status = 'absent' AND a.attendance_date >= ? GROUP BY s.id HAVING COUNT(*) >= ? ORDER BY absences DESC LIMIT 10`,
      [ids, addDays(toDateStr(), -6), repeatN]),
    db.query(
      `SELECT e.id, e.clearance_status, s.name, e.requested_exit_date FROM hostel_exit_records e JOIN students s ON s.id = e.student_id
         JOIN room_allocations ra ON ra.id = e.allocation_id WHERE ra.hostel_id IN (?) AND e.clearance_status IN ('requested','inspected') ORDER BY e.requested_exit_date LIMIT 10`, [ids]),
    db.query(
      `SELECT sf.student_id, s.name, s.register_number, (sf.total_amount - sf.discount - sf.amount_paid) AS balance, DATEDIFF(CURDATE(), sf.due_date) AS days
         FROM student_fees sf JOIN students s ON s.id = sf.student_id JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        WHERE ra.hostel_id IN (?) AND sf.waived = 0 AND sf.amount_paid < sf.total_amount - sf.discount AND sf.due_date < CURDATE() - INTERVAL 30 DAY
        ORDER BY days DESC LIMIT 10`, [ids]),
  ]);

  const items = [
    ...sla.map((c) => ({ severity: 'high', type: 'complaint_sla', title: `Complaint ${c.complaint_code}`, detail: `${c.title} — SLA breached ${c.hours_over}h ago${c.escalation_level ? ` (escalation L${c.escalation_level})` : ''}`, action: 'View', link: `/complaints/${c.id}` })),
    ...overdue.map((l) => ({ severity: 'high', type: 'leave_overdue', title: `${l.name} (${l.register_number})`, detail: `Leave ${l.leave_code} return overdue by ${l.hours_over}h`, action: 'Investigate', link: `/students/${l.student_id}` })),
    ...absences.map((a) => ({ severity: 'high', type: 'repeated_absence', title: `${a.name} (${a.register_number})`, detail: `${a.absences} absences in the last 7 days`, action: 'Investigate', link: `/students/${a.student_id}` })),
    ...critical.filter((c) => ['critical', 'high'].includes(c.priority)).map((c) => ({ severity: c.priority === 'critical' ? 'high' : 'medium', type: 'complaint_unassigned', title: `Complaint ${c.complaint_code}`, detail: `${c.title} — ${c.priority}, not yet assigned`, action: 'Assign', link: `/complaints/${c.id}` })),
    ...leaves.map((l) => ({ severity: 'medium', type: 'leave_pending', title: `Leave ${l.leave_code}`, detail: `${l.name} — ${l.leave_type} leave from ${l.from_date} awaiting approval`, action: 'Review', link: `/leaves?highlight=${l.id}` })),
    ...maint.map((m) => ({ severity: m.priority === 'critical' ? 'high' : 'medium', type: 'maintenance', title: `${m.request_code}${m.room_number ? ` · Room ${m.room_number}` : ''}`, detail: `${m.title} — open ${m.age_days} day(s)${m.blocks_room ? ', room blocked' : ''}`, action: 'View', link: '/maintenance' })),
    ...apps.map((a) => ({ severity: 'medium', type: 'application', title: `Application ${a.application_code}`, detail: `${a.name} — ${a.status.replace(/_/g, ' ')}`, action: 'Review', link: `/applications/${a.id}` })),
    ...alloc.map((a) => ({ severity: 'medium', type: 'allocation', title: `${a.name}`, detail: `Admission approved (${a.application_code}) — awaiting bed allocation`, action: 'Allocate', link: `/allocations?studentId=${a.student_id}` })),
    ...exits.map((e) => ({ severity: 'medium', type: 'exit', title: `Exit: ${e.name}`, detail: `${e.clearance_status === 'requested' ? 'Room inspection pending' : 'Clearance pending'} (exit ${e.requested_exit_date})`, action: 'Process', link: '/exits' })),
    ...visitors.map((v) => ({ severity: 'low', type: 'visitor', title: `Visitor ${v.name}`, detail: `Inside for ${Math.floor(v.minutes / 60)}h ${v.minutes % 60}m (${v.pass_code})`, action: 'Check', link: '/visitors' })),
    ...fees.map((f) => ({ severity: 'low', type: 'fee', title: `${f.name} (${f.register_number})`, detail: `₹${Number(f.balance).toLocaleString('en-IN')} overdue by ${f.days} days`, action: 'View', link: `/fees?search=${f.register_number}` })),
  ];
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, limit);
}

async function charts(ids) {
  const today = toDateStr();
  const [occupancy, attendance, complaints, fees] = await Promise.all([
    db.query(
      `SELECT h.id, h.code, h.name, SUM(b.status = 'occupied') AS occupied, SUM(b.status = 'available' AND r.status = 'active') AS available,
              SUM(b.status IN ('maintenance','blocked','reserved') OR (b.status = 'available' AND r.status <> 'active')) AS unavailable
         FROM hostels h JOIN rooms r ON r.hostel_id = h.id AND r.deleted_at IS NULL AND r.status <> 'inactive' JOIN beds b ON b.room_id = r.id
        WHERE h.id IN (?) GROUP BY h.id ORDER BY h.code`, [ids]),
    db.query(
      `SELECT attendance_date AS date, SUM(status IN ('present','late')) AS present, SUM(status = 'absent') AS absent, SUM(status = 'on_leave') AS on_leave,
              ROUND(100 * SUM(status IN ('present','late')) / NULLIF(SUM(status IN ('present','late','absent')),0), 1) AS percentage
         FROM attendance WHERE hostel_id IN (?) AND attendance_date >= ? GROUP BY attendance_date ORDER BY attendance_date`, [ids, addDays(today, -13)]),
    db.one(
      `SELECT SUM(status = 'pending') AS pending, SUM(status = 'assigned') AS assigned, SUM(status = 'in_progress') AS in_progress,
              SUM(status IN ('resolved','closed') AND created_at >= NOW() - INTERVAL 30 DAY) AS resolved,
              SUM(status IN ('pending','assigned','in_progress') AND sla_due_at < NOW()) AS breached
         FROM complaints WHERE hostel_id IN (?)`, [ids]),
    db.one(
      `SELECT SUM(sf.amount_paid) AS collected,
              SUM(IF(${FEE_STATUS_SQL} IN ('pending','partial'), sf.total_amount - sf.discount - sf.amount_paid, 0)) AS pending,
              SUM(IF(${FEE_STATUS_SQL} = 'overdue', sf.total_amount - sf.discount - sf.amount_paid, 0)) AS overdue
         FROM student_fees sf JOIN room_allocations ra ON ra.student_id = sf.student_id AND ra.status = 'active' WHERE ra.hostel_id IN (?)`, [ids]),
  ]);
  const categories = await db.query(
    `SELECT category, COUNT(*) AS count FROM complaints WHERE hostel_id IN (?) AND created_at >= NOW() - INTERVAL 30 DAY GROUP BY category ORDER BY count DESC`, [ids]);
  const n = (v) => Number(v || 0);
  return {
    occupancy: occupancy.map((o) => ({ ...o, occupied: n(o.occupied), available: n(o.available), unavailable: n(o.unavailable) })),
    attendance: attendance.map((a) => ({ ...a, present: n(a.present), absent: n(a.absent), on_leave: n(a.on_leave), percentage: n(a.percentage) })),
    complaints: [
      { name: 'Pending', value: n(complaints.pending) }, { name: 'Assigned', value: n(complaints.assigned) },
      { name: 'In progress', value: n(complaints.in_progress) }, { name: 'Resolved (30d)', value: n(complaints.resolved) }, { name: 'SLA breached', value: n(complaints.breached) },
    ],
    complaintCategories: categories,
    fees: [{ name: 'Collected', value: n(fees.collected) }, { name: 'Pending', value: n(fees.pending) }, { name: 'Overdue', value: n(fees.overdue) }],
  };
}

async function commandCenter(user, hostelId) {
  const ids = await resolveHostels(user, hostelId);
  const hostels = await db.query('SELECT id, code, name, gender FROM hostels WHERE id IN (?) ORDER BY code', [ids]);
  const [k, actions, c, health] = await Promise.all([
    kpis(ids), actionItems(ids), charts(ids),
    Promise.all(hostels.map(async (h) => ({ ...h, ...(await hostelHealth(h.id)) }))),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    hostels,
    kpis: k,
    exceptions: {
      absentToday: k.absentToday, overdueReturns: k.overdueReturns, slaBreached: k.slaBreached, feeOverdue: k.feeOverdue,
      notMarked: k.notMarked, staleMaintenance: k.staleMaintenance, unassignedComplaints: k.unassignedComplaints,
    },
    actions,
    charts: c,
    health,
  };
}

module.exports = { resolveHostels, kpis, actionItems, charts, commandCenter };
