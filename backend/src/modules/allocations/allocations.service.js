const db = require('../../config/db');
const { notFound, conflict, forbidden } = require('../../utils/AppError');
const { currentAcademicYear } = require('../../utils/helpers');
const { notify } = require('../../services/notify');
const { audit } = require('../../services/audit');
const { assertHostelAccess } = require('../../utils/scope');

const APPROVED_STATES = ['approved', 'fee_assigned'];

// Locks the bed and its room, and validates that a new student can be placed there.
async function lockAllocatableBed(conn, bedId, student) {
  const bed = await db.one(
    `SELECT b.id, b.bed_code, b.status, b.room_id FROM beds b WHERE b.id = ? FOR UPDATE`, [bedId], conn);
  if (!bed) throw notFound('Bed');
  const room = await db.one(
    `SELECT r.id, r.room_number, r.capacity, r.current_occupancy, r.status, r.hostel_id, h.gender AS hostel_gender, h.status AS hostel_status, h.code AS hostel_code
       FROM rooms r JOIN hostels h ON h.id = r.hostel_id WHERE r.id = ? AND r.deleted_at IS NULL FOR UPDATE`, [bed.room_id], conn);
  if (!room) throw notFound('Room');

  if (bed.status === 'occupied') throw conflict('Bed is already occupied', 'BED_ALREADY_OCCUPIED');
  if (bed.status !== 'available') throw conflict(`Bed is ${bed.status} and cannot be allocated`, 'BED_UNAVAILABLE');
  if (room.status !== 'active') throw conflict(`Room ${room.room_number} is under ${room.status}; allocation is not allowed`, 'ROOM_NOT_ACTIVE');
  if (room.hostel_status !== 'active') throw conflict('Hostel is not accepting allocations', 'HOSTEL_NOT_ACTIVE');
  if (room.current_occupancy >= room.capacity) throw conflict(`Room ${room.room_number} is full`, 'ROOM_FULL');
  if (room.hostel_gender !== 'co-ed' && room.hostel_gender !== student.gender) {
    throw conflict('This hostel does not accommodate the student\'s gender', 'GENDER_MISMATCH');
  }
  return { bed, room };
}

async function occupy(conn, bed, room) {
  await conn.query("UPDATE beds SET status = 'occupied' WHERE id = ?", [bed.id]);
  await conn.query('UPDATE rooms SET current_occupancy = current_occupancy + 1 WHERE id = ?', [room.id]);
}

// Frees a bed. If the room is not active the bed follows the room's state.
async function release(conn, bedId, roomId) {
  const room = await db.one('SELECT status FROM rooms WHERE id = ? FOR UPDATE', [roomId], conn);
  const next = room.status === 'active' ? 'available' : (room.status === 'maintenance' ? 'maintenance' : 'blocked');
  await conn.query('UPDATE beds SET status = ? WHERE id = ?', [next, bedId]);
  await conn.query('UPDATE rooms SET current_occupancy = current_occupancy - 1 WHERE id = ? AND current_occupancy > 0', [roomId]);
}

/** Allocate a bed to an approved student. */
async function allocate(req, { studentId, bedId, remarks }) {
  return db.transaction(async (conn) => {
    const student = await db.one(
      'SELECT id, user_id, name, register_number, gender, hostel_status FROM students WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [studentId], conn);
    if (!student) throw notFound('Student');

    const existing = await db.one("SELECT id FROM room_allocations WHERE student_id = ? AND status = 'active'", [studentId], conn);
    if (existing) throw conflict('Student already has an active bed allocation', 'STUDENT_ALREADY_ALLOCATED');

    const app = await db.one(
      `SELECT id, application_code, status, academic_year FROM hostel_applications
        WHERE student_id = ? AND status IN (?) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [studentId, APPROVED_STATES], conn);
    if (!app) throw conflict('Student does not have an approved hostel application', 'ADMISSION_NOT_APPROVED');

    const { bed, room } = await lockAllocatableBed(conn, bedId, student);
    assertHostelAccess(req.user, room.hostel_id);

    const [r] = await conn.query(
      `INSERT INTO room_allocations (student_id, bed_id, room_id, hostel_id, application_id, academic_year, allocated_by)
       VALUES (?,?,?,?,?,?,?)`, [studentId, bed.id, room.id, room.hostel_id, app.id, app.academic_year || currentAcademicYear(), req.user.id]);
    await occupy(conn, bed, room);
    await conn.query("UPDATE students SET hostel_status = 'resident' WHERE id = ?", [studentId]);
    await conn.query("UPDATE hostel_applications SET status = 'allocated' WHERE id = ?", [app.id]);
    await conn.query("INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks) VALUES (?,?,?,?,?)",
      [app.id, app.status, 'allocated', req.user.id, `Allocated bed ${bed.bed_code}`]);

    await notify(student.user_id, {
      type: 'room_allocated', title: 'Room allocated',
      message: `You have been allocated bed ${bed.bed_code} (Room ${room.room_number}).`, link: '/my/hostel',
    }, conn);
    await audit(req, {
      action: 'BED_ALLOCATED', module: 'allocations', recordId: r.insertId,
      summary: `Allocated ${bed.bed_code} to ${student.register_number} - ${student.name}${remarks ? ` (${remarks})` : ''}`,
      newValue: { studentId, bedId: bed.id, bedCode: bed.bed_code, applicationId: app.id },
    }, conn);
    return { id: r.insertId, bedCode: bed.bed_code, roomNumber: room.room_number };
  });
}

/** Transfer: closes the old allocation (kept as history) and opens a new one in a single transaction. */
async function transfer(req, allocationId, { newBedId, reason }) {
  return db.transaction(async (conn) => {
    const current = await db.one(
      `SELECT ra.*, b.bed_code, s.name AS student_name, s.register_number, s.gender, s.user_id
         FROM room_allocations ra JOIN beds b ON b.id = ra.bed_id JOIN students s ON s.id = ra.student_id
        WHERE ra.id = ? FOR UPDATE`, [allocationId], conn);
    if (!current) throw notFound('Allocation');
    if (current.status !== 'active') throw conflict('Only active allocations can be transferred', 'ALLOCATION_NOT_ACTIVE');
    assertHostelAccess(req.user, current.hostel_id);
    if (current.bed_id === Number(newBedId)) throw conflict('Student is already in this bed', 'SAME_BED');

    // Lock old bed first, then the target, to keep a consistent lock order.
    await db.one('SELECT id FROM beds WHERE id = ? FOR UPDATE', [current.bed_id], conn);
    const { bed, room } = await lockAllocatableBed(conn, newBedId, current);
    assertHostelAccess(req.user, room.hostel_id);

    await conn.query("UPDATE room_allocations SET status = 'transferred', ended_at = NOW(), end_reason = ? WHERE id = ?", [`Transfer: ${reason}`, current.id]);
    await release(conn, current.bed_id, current.room_id);

    const [r] = await conn.query(
      `INSERT INTO room_allocations (student_id, bed_id, room_id, hostel_id, application_id, academic_year, allocated_by)
       VALUES (?,?,?,?,?,?,?)`, [current.student_id, bed.id, room.id, room.hostel_id, current.application_id, current.academic_year, req.user.id]);
    await occupy(conn, bed, room);
    await conn.query(
      `INSERT INTO room_transfer_history (student_id, from_allocation_id, to_allocation_id, from_bed_id, to_bed_id, reason, transferred_by)
       VALUES (?,?,?,?,?,?,?)`, [current.student_id, current.id, r.insertId, current.bed_id, bed.id, reason, req.user.id]);

    await notify(current.user_id, {
      type: 'room_transferred', title: 'Room transferred',
      message: `You have been moved from ${current.bed_code} to ${bed.bed_code}. Reason: ${reason}`, link: '/my/hostel',
    }, conn);
    await audit(req, {
      action: 'ROOM_TRANSFERRED', module: 'allocations', recordId: r.insertId,
      summary: `Transferred ${current.register_number} - ${current.student_name}: ${current.bed_code} → ${bed.bed_code}`,
      oldValue: { bedCode: current.bed_code, allocationId: current.id }, newValue: { bedCode: bed.bed_code, allocationId: r.insertId, reason },
    }, conn);
    return { id: r.insertId, from: current.bed_code, to: bed.bed_code };
  });
}

/** Ends an allocation and frees the bed. Used directly and by the exit-clearance workflow. */
async function vacate(req, allocationId, reason, conn) {
  const run = async (c) => {
    const a = await db.one(
      `SELECT ra.*, b.bed_code, s.name AS student_name, s.register_number, s.user_id
         FROM room_allocations ra JOIN beds b ON b.id = ra.bed_id JOIN students s ON s.id = ra.student_id WHERE ra.id = ? FOR UPDATE`, [allocationId], c);
    if (!a) throw notFound('Allocation');
    if (a.status !== 'active') throw conflict('Allocation is not active', 'ALLOCATION_NOT_ACTIVE');
    if (req.user.role !== 'super_admin' && !req.user.hostelIds.includes(a.hostel_id)) throw forbidden('This allocation is outside your scope');
    await c.query("UPDATE room_allocations SET status = 'vacated', ended_at = NOW(), end_reason = ? WHERE id = ?", [reason, a.id]);
    await release(c, a.bed_id, a.room_id);
    await c.query("UPDATE students SET hostel_status = 'exited' WHERE id = ?", [a.student_id]);
    await audit(req, { action: 'BED_VACATED', module: 'allocations', recordId: a.id, summary: `Released ${a.bed_code} held by ${a.register_number} - ${a.student_name}: ${reason}`, oldValue: { status: 'active', bedCode: a.bed_code }, newValue: { status: 'vacated', reason } }, c);
    return { id: a.id, bedCode: a.bed_code, userId: a.user_id };
  };
  return conn ? run(conn) : db.transaction(run);
}

/**
 * Suggests suitable beds for a student: matching gender, preferred hostel / room type first,
 * then rooms that already house students of the same department and year.
 */
async function suggestBeds(user, studentId) {
  const student = await db.one(
    `SELECT s.id, s.gender, s.department_id, s.year_of_study, a.preferred_hostel_id, a.preferred_room_type, a.needs_ac
       FROM students s LEFT JOIN hostel_applications a ON a.student_id = s.id AND a.status IN ('approved','fee_assigned')
      WHERE s.id = ?`, [studentId]);
  if (!student) throw notFound('Student');
  const scoped = user.role !== 'super_admin';
  const rows = await db.query(
    `SELECT b.id AS bed_id, b.bed_code, r.id AS room_id, r.room_number, r.room_type, r.capacity, r.current_occupancy, r.is_ac,
            h.id AS hostel_id, h.name AS hostel_name, h.code AS hostel_code, f.floor_number,
            (SELECT COUNT(*) FROM room_allocations x JOIN students y ON y.id = x.student_id
              WHERE x.room_id = r.id AND x.status = 'active' AND y.department_id = ?) AS same_department,
            (SELECT COUNT(*) FROM room_allocations x JOIN students y ON y.id = x.student_id
              WHERE x.room_id = r.id AND x.status = 'active' AND y.year_of_study = ?) AS same_year
       FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id JOIN floors f ON f.id = r.floor_id
      WHERE b.status = 'available' AND r.status = 'active' AND h.status = 'active' AND r.deleted_at IS NULL
        AND r.current_occupancy < r.capacity AND h.gender IN (?, 'co-ed') ${scoped ? 'AND h.id IN (?)' : ''}`,
    [student.department_id, student.year_of_study, student.gender, ...(scoped ? [user.hostelIds.length ? user.hostelIds : [0]] : [])]);
  const scored = rows.map((r) => {
    const reasons = [];
    let score = 0;
    if (student.preferred_hostel_id === r.hostel_id) { score += 30; reasons.push('Preferred hostel'); }
    if (student.preferred_room_type === r.room_type) { score += 20; reasons.push('Preferred room type'); }
    if (student.needs_ac && r.is_ac) { score += 10; reasons.push('AC room'); }
    if (r.same_year) { score += 8 * r.same_year; reasons.push(`${r.same_year} same-year roommate(s)`); }
    if (r.same_department) { score += 5 * r.same_department; reasons.push(`${r.same_department} same-department roommate(s)`); }
    if (r.current_occupancy > 0) { score += 3; reasons.push('Fills a partially occupied room'); }
    return { ...r, score, reasons };
  });
  // One suggestion per room keeps the list diverse.
  const seen = new Set();
  return scored.sort((a, b) => b.score - a.score || a.bed_code.localeCompare(b.bed_code))
    .filter((r) => (seen.has(r.room_id) ? false : seen.add(r.room_id))).slice(0, 15);
}

module.exports = { allocate, transfer, vacate, suggestBeds, release };
