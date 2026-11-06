const db = require('../../config/db');
const { conflict, badRequest } = require('../../utils/AppError');
const { toDateStr, addDays } = require('../../utils/helpers');
const { getSettings } = require('../../services/settings');
const { audit } = require('../../services/audit');

// Residents of a hostel on a given date with their existing mark and any approved leave covering that date.
async function roster(hostelId, date, { floorId, roomId } = {}) {
  return db.query(
    `SELECT s.id AS student_id, s.name, s.register_number, s.photo_url, d.short_name AS department, s.year_of_study,
            r.id AS room_id, r.room_number, f.floor_number, b.bed_code,
            a.id AS attendance_id, a.status, a.check_in_time, a.remarks,
            lr.id AS leave_id, lr.leave_code, lr.from_date AS leave_from, lr.to_date AS leave_to
       FROM room_allocations ra
       JOIN students s ON s.id = ra.student_id JOIN departments d ON d.id = s.department_id
       JOIN beds b ON b.id = ra.bed_id JOIN rooms r ON r.id = ra.room_id JOIN floors f ON f.id = r.floor_id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date = ?
       LEFT JOIN leave_requests lr ON lr.id = (
           SELECT l.id FROM leave_requests l WHERE l.student_id = s.id AND l.status IN ('approved','returned')
              AND ? BETWEEN l.from_date AND l.to_date AND (l.returned_at IS NULL OR DATE(l.returned_at) > ?) LIMIT 1)
      WHERE ra.hostel_id = ? AND ra.status = 'active' AND DATE(ra.allocated_at) <= ?
        ${floorId ? 'AND r.floor_id = ?' : ''} ${roomId ? 'AND r.id = ?' : ''}
      ORDER BY f.floor_number, r.room_number, b.bed_number`,
    [date, date, date, hostelId, date, ...(floorId ? [floorId] : []), ...(roomId ? [roomId] : [])]);
}

/**
 * Saves attendance for a hostel/date. Existing marks are only replaced when overwrite=true,
 * so accidental double submission is rejected with DUPLICATE_ATTENDANCE.
 */
async function mark(req, { hostelId, date, records, overwrite }) {
  const today = toDateStr();
  if (date > today) throw badRequest('Attendance cannot be marked for a future date', 'INVALID_DATE');
  if (req.user.role !== 'super_admin' && date < addDays(today, -7)) {
    throw badRequest('Attendance older than 7 days can only be corrected by an administrator', 'DATE_LOCKED');
  }
  const ids = records.map((r) => r.studentId);
  if (new Set(ids).size !== ids.length) throw badRequest('A student appears more than once in the submission', 'DUPLICATE_STUDENT');

  const settings = await getSettings();
  const lateAfter = settings.attendance_late_after;

  return db.transaction(async (conn) => {
    const list = await roster(hostelId, date);
    const byId = new Map(list.map((r) => [r.student_id, r]));
    const invalid = ids.filter((id) => !byId.has(id));
    if (invalid.length) throw badRequest(`Student(s) ${invalid.join(', ')} are not residents of this hostel on ${date}`, 'INVALID_STUDENT');

    const existing = list.filter((r) => ids.includes(r.student_id) && r.attendance_id);
    if (existing.length && !overwrite) {
      throw conflict(`Attendance already recorded for ${existing.length} student(s) on ${date} (e.g. ${existing[0].name}). Use edit to change it.`, 'DUPLICATE_ATTENDANCE');
    }

    const adjusted = [];
    const values = records.map((r) => {
      let status = r.status;
      const row = byId.get(r.studentId);
      // Leave integration: an approved leave turns an absence into "on leave".
      if (row.leave_id && status === 'absent') { status = 'on_leave'; adjusted.push({ studentId: r.studentId, reason: `Approved leave ${row.leave_code}` }); }
      if (status === 'present' && r.checkInTime && r.checkInTime.slice(0, 5) > lateAfter) { status = 'late'; adjusted.push({ studentId: r.studentId, reason: `Checked in after ${lateAfter}` }); }
      return [r.studentId, hostelId, date, status, r.checkInTime || null, r.remarks || null, req.user.id];
    });
    await conn.query(
      `INSERT INTO attendance (student_id, hostel_id, attendance_date, status, check_in_time, remarks, marked_by) VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status), check_in_time = VALUES(check_in_time), remarks = VALUES(remarks), marked_by = VALUES(marked_by)`,
      [values]);
    await audit(req, {
      action: existing.length ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_MARKED', module: 'attendance', recordId: `${hostelId}:${date}`,
      summary: `${existing.length ? 'Updated' : 'Marked'} attendance for ${records.length} student(s) on ${date}`,
      oldValue: existing.length ? existing.map((e) => ({ studentId: e.student_id, status: e.status })) : undefined,
      newValue: { count: records.length, absent: values.filter((v) => v[3] === 'absent').length },
    }, conn);
    return { saved: records.length, updated: existing.length, adjusted };
  });
}

/**
 * Attendance Exception Center scan. Persists exceptions for the date (idempotent) and
 * auto-resolves open ones whose condition no longer holds.
 */
async function scanExceptions(date = toDateStr(), hostelIds = null) {
  const s = await getSettings();
  const repeatN = Number(s.repeated_absence_count);
  const lowPct = Number(s.attendance_low_threshold);
  const today = toDateStr();
  const now = new Date();
  const [h, m] = s.attendance_late_after.split(':').map(Number);
  const pastCutoff = date < today || now.getHours() * 60 + now.getMinutes() > h * 60 + m + 60;
  const monthStart = `${date.slice(0, 7)}-01`;
  const hFilter = hostelIds ? 'AND ra.hostel_id IN (?)' : '';
  const hParams = hostelIds ? [hostelIds.length ? hostelIds : [0]] : [];

  const insert = (type, sql, params) => db.query(
    `INSERT IGNORE INTO attendance_exceptions (student_id, hostel_id, exception_date, exception_type, details) ${sql}`, params);

  // Absent with / without approved leave.
  const absentBase = `FROM attendance a JOIN room_allocations ra ON ra.student_id = a.student_id AND ra.status = 'active'
    WHERE a.attendance_date = ? AND a.status = 'absent' ${hFilter}`;
  const leaveExists = `EXISTS (SELECT 1 FROM leave_requests l WHERE l.student_id = a.student_id AND l.status = 'approved' AND a.attendance_date BETWEEN l.from_date AND l.to_date)`;
  await insert('absent', `SELECT a.student_id, ra.hostel_id, ?, 'absent', 'Marked absent without approved leave' ${absentBase} AND NOT ${leaveExists}`, [date, date, ...hParams]);
  await insert('absent_with_leave', `SELECT a.student_id, ra.hostel_id, ?, 'absent_with_leave', 'Marked absent although an approved leave covers this date' ${absentBase} AND ${leaveExists}`, [date, date, ...hParams]);

  // Repeated absence in the trailing 7 days.
  await insert('repeated_absence',
    `SELECT a.student_id, ra.hostel_id, ?, 'repeated_absence', CONCAT(COUNT(*), ' absences in the last 7 days')
       FROM attendance a JOIN room_allocations ra ON ra.student_id = a.student_id AND ra.status = 'active'
      WHERE a.attendance_date BETWEEN ? AND ? AND a.status = 'absent' ${hFilter}
      GROUP BY a.student_id, ra.hostel_id HAVING COUNT(*) >= ?`, [date, addDays(date, -6), date, ...hParams, repeatN]);

  // Low month-to-date attendance (needs at least 5 counted days to be meaningful).
  await insert('low_attendance',
    `SELECT a.student_id, ra.hostel_id, ?, 'low_attendance',
            CONCAT('Attendance ', ROUND(100 * SUM(a.status IN ('present','late')) / SUM(a.status IN ('present','late','absent')), 1), '% this month')
       FROM attendance a JOIN room_allocations ra ON ra.student_id = a.student_id AND ra.status = 'active'
      WHERE a.attendance_date BETWEEN ? AND ? ${hFilter}
      GROUP BY a.student_id, ra.hostel_id
     HAVING SUM(a.status IN ('present','late','absent')) >= 5
        AND 100 * SUM(a.status IN ('present','late')) / SUM(a.status IN ('present','late','absent')) < ?`,
    [monthStart, monthStart, date, ...hParams, lowPct]);

  // Not marked (only after the day's roll-call window has passed).
  if (pastCutoff) {
    await insert('not_marked',
      `SELECT ra.student_id, ra.hostel_id, ?, 'not_marked', 'No attendance recorded for this date'
         FROM room_allocations ra
        WHERE ra.status = 'active' AND DATE(ra.allocated_at) <= ? ${hFilter}
          AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = ra.student_id AND a.attendance_date = ?)`,
      [date, date, ...hParams, date]);
  }

  // Auto-resolve exceptions whose underlying condition has changed.
  await db.query(
    `UPDATE attendance_exceptions e
        LEFT JOIN attendance a ON a.student_id = e.student_id AND a.attendance_date = e.exception_date
        SET e.status = 'resolved', e.resolution_notes = 'Auto-resolved: attendance record changed', e.resolved_at = NOW()
      WHERE e.exception_date = ? AND e.status = 'open'
        AND ((e.exception_type = 'not_marked' AND a.id IS NOT NULL)
          OR (e.exception_type IN ('absent','absent_with_leave') AND (a.id IS NULL OR a.status <> 'absent')))`, [date]);
}

/** A student's calendar for one month (YYYY-MM) with counts, percentage and the last 6 months. */
async function monthAttendance(studentId, month) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : toDateStr().slice(0, 7);
  const records = await db.query(
    `SELECT attendance_date, status, check_in_time, remarks FROM attendance
      WHERE student_id = ? AND attendance_date BETWEEN ? AND LAST_DAY(?) ORDER BY attendance_date`, [studentId, `${m}-01`, `${m}-01`]);
  const count = (st) => records.filter((r) => r.status === st).length;
  const counted = count('present') + count('late') + count('absent');
  const history = await db.query(
    `SELECT DATE_FORMAT(attendance_date, '%Y-%m') AS month,
            ROUND(100 * SUM(status IN ('present','late')) / NULLIF(SUM(status IN ('present','late','absent')),0), 1) AS percentage
       FROM attendance WHERE student_id = ? GROUP BY month ORDER BY month DESC LIMIT 6`, [studentId]);
  return {
    month: m,
    records,
    stats: {
      present: count('present'), late: count('late'), absent: count('absent'), onLeave: count('on_leave'), outPass: count('out_pass'),
      percentage: counted ? Math.round(((count('present') + count('late')) / counted) * 1000) / 10 : 0,
    },
    history,
  };
}

module.exports = { roster, mark, scanExceptions, monthAttendance };
