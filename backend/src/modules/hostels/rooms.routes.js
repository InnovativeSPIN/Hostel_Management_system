const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { scopeHostel, assertHostelAccess } = require('../../utils/scope');
const { tempCode, assignCode } = require('../../utils/helpers');

router.use(authenticate);

const ROOM_TYPES = ['single', 'double', 'triple', 'quad', 'dormitory'];
const roomBody = z.object({
  hostelId: z.coerce.number().int().positive(),
  floorId: z.coerce.number().int().positive(),
  roomNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, 'Room number may contain letters, digits and hyphen'),
  roomType: z.enum(ROOM_TYPES),
  capacity: z.coerce.number().int().min(1).max(20),
  isAc: z.coerce.boolean().default(false),
  attachedBath: z.coerce.boolean().default(false),
});

const bedCode = (hostelCode, floorNo, roomNo, n) => `${hostelCode}-${floorNo}-${roomNo}-B${n}`;

async function createBeds(conn, room, from, to) {
  const ctx = await db.one(
    'SELECT h.code, f.floor_number FROM rooms r JOIN hostels h ON h.id = r.hostel_id JOIN floors f ON f.id = r.floor_id WHERE r.id = ?', [room.id], conn);
  const values = [];
  for (let n = from; n <= to; n += 1) values.push([room.id, n, bedCode(ctx.code, ctx.floor_number, room.room_number, n), room.status === 'active' ? 'available' : 'maintenance']);
  if (values.length) await conn.query('INSERT INTO beds (room_id, bed_number, bed_code, status) VALUES ?', [values]);
}

/** GET /api/rooms  ?hostelId&floorId&status&roomType&hasVacancy&search&page&limit&sort */
router.get('/', authorize('hostels.view', 'allocations.manage'), async (req, res) => {
  const q = parseList(req.query, {
    sortable: { room: 'h.code, f.floor_number, r.room_number', occupancy: 'r.current_occupancy', capacity: 'r.capacity', status: 'r.status' },
    defaultSort: 'room',
    defaultOrder: 'asc',
  });
  const where = new Where().add('r.deleted_at IS NULL')
    .addIf(q.hostelId, 'r.hostel_id = ?', q.hostelId)
    .addIf(q.floorId, 'r.floor_id = ?', q.floorId)
    .addIf(q.status, 'r.status = ?', q.status)
    .addIf(q.roomType, 'r.room_type = ?', q.roomType)
    .search(q.search, ['r.room_number']);
  if (q.hasVacancy === 'true') where.add("EXISTS (SELECT 1 FROM beds b WHERE b.room_id = r.id AND b.status = 'available') AND r.status = 'active'");
  scopeHostel(where, req.user, 'r.hostel_id');
  paged(res, await paginate(db, {
    select: `r.*, h.name AS hostel_name, h.code AS hostel_code, h.gender, f.floor_number, f.label AS floor_label,
             (SELECT COUNT(*) FROM beds b WHERE b.room_id = r.id AND b.status = 'available') AS available_beds,
             (SELECT COUNT(*) FROM maintenance_requests m WHERE m.room_id = r.id AND m.status IN ('open','in_progress')) AS open_maintenance`,
    from: 'FROM rooms r JOIN hostels h ON h.id = r.hostel_id JOIN floors f ON f.id = r.floor_id',
    where, ...q,
  }));
});

/** GET /api/rooms/available  rooms with at least one free bed in an active room */
router.get('/available', authorize('allocations.manage', 'hostels.view'), async (req, res) => {
  const where = new Where().add('r.deleted_at IS NULL').add("r.status = 'active'").add("h.status = 'active'")
    .addIf(req.query.hostelId, 'r.hostel_id = ?', req.query.hostelId)
    .addIf(req.query.roomType, 'r.room_type = ?', req.query.roomType)
    .addIf(req.query.gender, 'h.gender IN (?, \'co-ed\')', req.query.gender);
  scopeHostel(where, req.user, 'r.hostel_id');
  ok(res, await db.query(
    `SELECT r.id, r.room_number, r.room_type, r.capacity, r.current_occupancy, r.is_ac, r.attached_bath,
            h.id AS hostel_id, h.name AS hostel_name, h.code AS hostel_code, h.gender, f.floor_number, f.label AS floor_label,
            COUNT(b.id) AS available_beds
       FROM rooms r JOIN hostels h ON h.id = r.hostel_id JOIN floors f ON f.id = r.floor_id
       JOIN beds b ON b.room_id = r.id AND b.status = 'available'
       ${where.sql} GROUP BY r.id ORDER BY h.code, f.floor_number, r.room_number`, where.params));
});

/** GET /api/rooms/:id  room, beds with current occupants, allocation history and open maintenance */
router.get('/:id', authorize('hostels.view', 'allocations.manage'), async (req, res) => {
  const room = await db.one(
    `SELECT r.*, h.name AS hostel_name, h.code AS hostel_code, f.floor_number, f.label AS floor_label
       FROM rooms r JOIN hostels h ON h.id = r.hostel_id JOIN floors f ON f.id = r.floor_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]);
  if (!room) throw notFound('Room');
  assertHostelAccess(req.user, room.hostel_id);
  const [beds, history, maintenance, complaints] = await Promise.all([
    bedsOfRoom(room.id),
    db.query(
      `SELECT ra.id, ra.status, ra.allocated_at, ra.ended_at, ra.end_reason, b.bed_code, s.name AS student_name, s.register_number
         FROM room_allocations ra JOIN beds b ON b.id = ra.bed_id JOIN students s ON s.id = ra.student_id
        WHERE ra.room_id = ? ORDER BY ra.allocated_at DESC LIMIT 50`, [room.id]),
    db.query(`SELECT id, request_code, title, status, priority, created_at FROM maintenance_requests WHERE room_id = ? ORDER BY created_at DESC LIMIT 20`, [room.id]),
    db.query(`SELECT c.id, c.complaint_code, c.title, c.category, c.priority, c.status, c.created_at, c.resolved_at, s.name AS student_name
                FROM complaints c JOIN students s ON s.id = c.student_id
               WHERE c.room_id = ? ORDER BY c.created_at DESC LIMIT 20`, [room.id]),
  ]);
  ok(res, { ...room, beds, history, maintenance, complaints });
});

function bedsOfRoom(roomId) {
  return db.query(
    `SELECT b.id, b.bed_number, b.bed_code, b.status, s.id AS student_id, s.name AS student_name, s.register_number,
            d.short_name AS department, s.year_of_study, ra.id AS allocation_id, ra.allocated_at
       FROM beds b
       LEFT JOIN room_allocations ra ON ra.bed_id = b.id AND ra.status = 'active'
       LEFT JOIN students s ON s.id = ra.student_id
       LEFT JOIN departments d ON d.id = s.department_id
      WHERE b.room_id = ? ORDER BY b.bed_number`, [roomId]);
}

/** GET /api/rooms/:roomId/beds */
router.get('/:roomId/beds', authorize('hostels.view', 'allocations.manage'), async (req, res) => {
  const room = await db.one('SELECT id, hostel_id FROM rooms WHERE id = ? AND deleted_at IS NULL', [req.params.roomId]);
  if (!room) throw notFound('Room');
  assertHostelAccess(req.user, room.hostel_id);
  ok(res, await bedsOfRoom(room.id));
});

/** POST /api/rooms  creates the room and its beds (one per capacity slot) */
router.post('/', authorize('hostels.manage'), validate(roomBody), async (req, res) => {
  const b = req.body;
  assertHostelAccess(req.user, b.hostelId);
  const floor = await db.one('SELECT id FROM floors WHERE id = ? AND hostel_id = ?', [b.floorId, b.hostelId]);
  if (!floor) throw badRequest('Floor does not belong to the selected hostel', 'INVALID_FLOOR');
  if (b.roomType === 'single' && b.capacity !== 1) throw badRequest('A single room must have capacity 1', 'INVALID_CAPACITY');
  const id = await db.transaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO rooms (hostel_id, floor_id, room_number, room_type, capacity, is_ac, attached_bath) VALUES (?,?,?,?,?,?,?)',
      [b.hostelId, b.floorId, b.roomNumber, b.roomType, b.capacity, b.isAc ? 1 : 0, b.attachedBath ? 1 : 0]);
    await createBeds(conn, { id: r.insertId, room_number: b.roomNumber, status: 'active' }, 1, b.capacity);
    await audit(req, { action: 'ROOM_CREATED', module: 'rooms', recordId: r.insertId, summary: `Created room ${b.roomNumber} with ${b.capacity} beds`, newValue: b }, conn);
    return r.insertId;
  });
  created(res, { id });
});

/** PUT /api/rooms/:id  update type / capacity / amenities. Capacity can only shrink by removing free beds. */
router.put('/:id', authorize('hostels.manage'), validate(roomBody.pick({ roomType: true, capacity: true, isAc: true, attachedBath: true })), async (req, res) => {
  const b = req.body;
  const result = await db.transaction(async (conn) => {
    const room = await db.one('SELECT * FROM rooms WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [req.params.id], conn);
    if (!room) throw notFound('Room');
    assertHostelAccess(req.user, room.hostel_id);
    if (b.capacity < room.current_occupancy) {
      throw conflict(`Room has ${room.current_occupancy} occupants; capacity cannot be lower than that`, 'CAPACITY_BELOW_OCCUPANCY');
    }
    const maxBed = (await db.one('SELECT COALESCE(MAX(bed_number),0) AS m, COUNT(*) AS n FROM beds WHERE room_id = ?', [room.id], conn));
    if (b.capacity > maxBed.n) {
      await createBeds(conn, room, maxBed.m + 1, maxBed.m + (b.capacity - maxBed.n));
    } else if (b.capacity < maxBed.n) {
      const removable = await db.query(
        `SELECT b.id FROM beds b WHERE b.room_id = ? AND b.status <> 'occupied'
            AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.bed_id = b.id)
          ORDER BY b.bed_number DESC LIMIT ?`, [room.id, maxBed.n - b.capacity], conn);
      if (removable.length < maxBed.n - b.capacity) {
        throw conflict('Not enough unused beds to remove. Beds with allocation history are kept for records; block them instead.', 'BEDS_IN_USE');
      }
      await conn.query('DELETE FROM beds WHERE id IN (?)', [removable.map((x) => x.id)]);
    }
    await conn.query('UPDATE rooms SET room_type=?, capacity=?, is_ac=?, attached_bath=? WHERE id=?',
      [b.roomType, b.capacity, b.isAc ? 1 : 0, b.attachedBath ? 1 : 0, room.id]);
    await audit(req, { action: 'ROOM_UPDATED', module: 'rooms', recordId: room.id, summary: `Updated room ${room.room_number}`, oldValue: room, newValue: b }, conn);
    return { id: room.id };
  });
  ok(res, result);
});

/**
 * PATCH /api/rooms/:id/status  { status, reason, createMaintenanceTask, category }
 * Maintenance/blocked rooms stop new allocations, notify occupants and (optionally) open a maintenance task.
 */
router.patch('/:id/status', authorize('hostels.manage', 'maintenance.manage'),
  validate(z.object({
    status: z.enum(['active', 'maintenance', 'blocked', 'inactive']),
    reason: z.string().trim().min(3).max(255),
    createMaintenanceTask: z.coerce.boolean().default(true),
    category: z.enum(['electrical', 'plumbing', 'cleaning', 'furniture', 'structural', 'internet', 'pest_control', 'other']).default('other'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  })),
  async (req, res) => {
    const b = req.body;
    const out = await db.transaction(async (conn) => {
      const room = await db.one('SELECT r.*, h.code AS hostel_code FROM rooms r JOIN hostels h ON h.id = r.hostel_id WHERE r.id = ? AND r.deleted_at IS NULL FOR UPDATE', [req.params.id], conn);
      if (!room) throw notFound('Room');
      assertHostelAccess(req.user, room.hostel_id);
      if (room.status === b.status) throw conflict(`Room is already ${b.status}`, 'NO_STATUS_CHANGE');
      if (b.status === 'inactive' && room.current_occupancy > 0) throw conflict('Vacate or transfer all occupants before deactivating the room', 'ROOM_OCCUPIED');

      const bedStatus = { active: 'available', maintenance: 'maintenance', blocked: 'blocked', inactive: 'blocked' }[b.status];
      // Occupied and reserved beds keep their status; only free beds change.
      await conn.query(
        `UPDATE beds SET status = ? WHERE room_id = ? AND status IN ('available','maintenance','blocked')`, [bedStatus, room.id]);
      await conn.query('UPDATE rooms SET status = ?, status_reason = ? WHERE id = ?', [b.status, b.reason, room.id]);

      let maintenanceId = null;
      if (b.status === 'maintenance' && b.createMaintenanceTask) {
        const [m] = await conn.query(
          `INSERT INTO maintenance_requests (request_code, hostel_id, room_id, category, priority, title, description, blocks_room, requested_by)
           VALUES (?,?,?,?,?,?,?,1,?)`,
          [tempCode(), room.hostel_id, room.id, b.category, b.priority, `Room ${room.room_number} maintenance`, b.reason, req.user.id]);
        maintenanceId = m.insertId;
        await assignCode(conn, 'maintenance_requests', 'request_code', 'MNT', m.insertId);
      }
      if (b.status === 'active') {
        await conn.query("UPDATE maintenance_requests SET blocks_room = 0 WHERE room_id = ? AND status IN ('open','in_progress')", [room.id]);
      }
      if (b.status !== 'active' && room.current_occupancy > 0) {
        const occupants = await db.query(
          `SELECT s.user_id FROM room_allocations ra JOIN students s ON s.id = ra.student_id WHERE ra.room_id = ? AND ra.status = 'active'`, [room.id], conn);
        await notify(occupants.map((o) => o.user_id), {
          type: 'room_maintenance', title: `Room ${room.room_number} under ${b.status}`,
          message: `Your room has been marked ${b.status}: ${b.reason}. The warden will contact you if you need to move.`, link: '/my/hostel',
        }, conn);
      }
      await audit(req, { action: 'ROOM_STATUS_CHANGED', module: 'rooms', recordId: room.id, summary: `Room ${room.hostel_code}-${room.room_number}: ${room.status} → ${b.status} (${b.reason})`, oldValue: { status: room.status }, newValue: { status: b.status, reason: b.reason } }, conn);
      return { id: room.id, status: b.status, maintenanceId };
    });
    ok(res, out);
  });

module.exports = router;
