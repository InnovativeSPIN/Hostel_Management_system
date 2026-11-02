const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict } = require('../../utils/AppError');
const { ok } = require('../../utils/respond');
const { Where } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { scopeHostel, assertHostelAccess } = require('../../utils/scope');

router.use(authenticate);

/** GET /api/beds/available  ?hostelId&roomType&gender&roomId - free beds in active rooms of active hostels */
router.get('/available', authorize('allocations.manage', 'hostels.view'), async (req, res) => {
  const where = new Where().add("b.status = 'available'").add("r.status = 'active'").add("h.status = 'active'").add('r.deleted_at IS NULL')
    .addIf(req.query.hostelId, 'r.hostel_id = ?', req.query.hostelId)
    .addIf(req.query.roomId, 'r.id = ?', req.query.roomId)
    .addIf(req.query.roomType, 'r.room_type = ?', req.query.roomType)
    .addIf(req.query.gender, "h.gender IN (?, 'co-ed')", req.query.gender);
  scopeHostel(where, req.user, 'r.hostel_id');
  ok(res, await db.query(
    `SELECT b.id, b.bed_code, b.bed_number, r.id AS room_id, r.room_number, r.room_type, r.capacity, r.current_occupancy, r.is_ac,
            h.id AS hostel_id, h.name AS hostel_name, h.code AS hostel_code, h.gender, f.floor_number, f.label AS floor_label
       FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id JOIN floors f ON f.id = r.floor_id
       ${where.sql} ORDER BY h.code, f.floor_number, r.room_number, b.bed_number LIMIT 500`, where.params));
});

/**
 * GET /api/beds/map  Live Bed Availability Map: hostel -> floor -> room -> bed.
 * Filters: hostelId, floor, roomType, gender, capacity, availableOnly=true
 */
router.get('/map', authorize('hostels.view', 'allocations.manage'), async (req, res) => {
  const where = new Where().add('r.deleted_at IS NULL').add('h.deleted_at IS NULL')
    .addIf(req.query.hostelId, 'h.id = ?', req.query.hostelId)
    .addIf(req.query.floor, 'f.floor_number = ?', req.query.floor)
    .addIf(req.query.roomType, 'r.room_type = ?', req.query.roomType)
    .addIf(req.query.gender, 'h.gender = ?', req.query.gender)
    .addIf(req.query.capacity, 'r.capacity = ?', req.query.capacity);
  if (req.query.availableOnly === 'true') {
    where.add("r.status = 'active' AND EXISTS (SELECT 1 FROM beds x WHERE x.room_id = r.id AND x.status = 'available')");
  }
  scopeHostel(where, req.user, 'h.id');
  const rows = await db.query(
    `SELECT h.id AS hostel_id, h.code AS hostel_code, h.name AS hostel_name, h.gender,
            f.id AS floor_id, f.floor_number, f.label AS floor_label,
            r.id AS room_id, r.room_number, r.room_type, r.capacity, r.current_occupancy, r.status AS room_status, r.status_reason, r.is_ac, r.attached_bath,
            b.id AS bed_id, b.bed_number, b.bed_code, b.status AS bed_status,
            s.id AS student_id, s.name AS student_name, s.register_number, d.short_name AS department, s.year_of_study
       FROM hostels h
       JOIN floors f ON f.hostel_id = h.id
       JOIN rooms r ON r.floor_id = f.id
       JOIN beds b ON b.room_id = r.id
       LEFT JOIN room_allocations ra ON ra.bed_id = b.id AND ra.status = 'active'
       LEFT JOIN students s ON s.id = ra.student_id
       LEFT JOIN departments d ON d.id = s.department_id
       ${where.sql}
      ORDER BY h.code, f.floor_number, r.room_number, b.bed_number`, where.params);

  // Fold the flat rows into a hierarchy.
  const hostels = new Map();
  const summary = { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0, blocked: 0 };
  for (const row of rows) {
    if (!hostels.has(row.hostel_id)) hostels.set(row.hostel_id, { id: row.hostel_id, code: row.hostel_code, name: row.hostel_name, gender: row.gender, floors: new Map() });
    const h = hostels.get(row.hostel_id);
    if (!h.floors.has(row.floor_id)) h.floors.set(row.floor_id, { id: row.floor_id, number: row.floor_number, label: row.floor_label, rooms: new Map() });
    const f = h.floors.get(row.floor_id);
    if (!f.rooms.has(row.room_id)) {
      f.rooms.set(row.room_id, {
        id: row.room_id, number: row.room_number, type: row.room_type, capacity: row.capacity, occupancy: row.current_occupancy,
        status: row.room_status, statusReason: row.status_reason, isAc: !!row.is_ac, attachedBath: !!row.attached_bath, beds: [],
      });
    }
    // A free bed in a non-active room is not allocatable, so present it with the room's status.
    const effective = row.bed_status === 'available' && row.room_status !== 'active' ? 'maintenance' : row.bed_status;
    f.rooms.get(row.room_id).beds.push({
      id: row.bed_id, number: row.bed_number, code: row.bed_code, status: effective,
      student: row.student_id ? { id: row.student_id, name: row.student_name, registerNumber: row.register_number, department: row.department, year: row.year_of_study } : null,
    });
    summary.total += 1;
    summary[effective] += 1;
  }
  const data = [...hostels.values()].map((h) => ({
    ...h, floors: [...h.floors.values()].map((f) => ({ ...f, rooms: [...f.rooms.values()] })),
  }));
  ok(res, { summary, hostels: data });
});

/** PATCH /api/beds/:id/status  { status: available|reserved|maintenance|blocked, reason } (occupied is set only by allocation) */
router.patch('/:id/status', authorize('hostels.manage'),
  validate(z.object({ status: z.enum(['available', 'reserved', 'maintenance', 'blocked']), reason: z.string().trim().min(3).max(255) })),
  async (req, res) => {
    const out = await db.transaction(async (conn) => {
      const bed = await db.one(
        'SELECT b.*, r.hostel_id, r.status AS room_status FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ? FOR UPDATE', [req.params.id], conn);
      if (!bed) throw notFound('Bed');
      assertHostelAccess(req.user, bed.hostel_id);
      if (bed.status === 'occupied') throw conflict('Bed is occupied. Vacate or transfer the student first.', 'BED_ALREADY_OCCUPIED');
      if (req.body.status === 'available' && bed.room_status !== 'active') throw conflict('The room is not active; reactivate the room first', 'ROOM_NOT_ACTIVE');
      await conn.query('UPDATE beds SET status = ? WHERE id = ?', [req.body.status, bed.id]);
      await audit(req, { action: 'BED_STATUS_CHANGED', module: 'beds', recordId: bed.id, summary: `Bed ${bed.bed_code}: ${bed.status} → ${req.body.status} (${req.body.reason})`, oldValue: { status: bed.status }, newValue: req.body }, conn);
      return { id: bed.id, status: req.body.status };
    });
    ok(res, out);
  });

module.exports = router;
