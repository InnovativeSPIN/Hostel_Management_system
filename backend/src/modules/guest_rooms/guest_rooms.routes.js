const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { tempCode, assignCode, toDateStr } = require('../../utils/helpers');

router.use(authenticate);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /api/guest-rooms  list guest rooms master */
router.get('/', authorize('hostels.view', 'allocations.manage'), async (_req, res) => {
  const rooms = await db.query(
    `SELECT gr.*, h.name AS hostel_name,
            (SELECT COUNT(*) FROM guest_room_bookings grb WHERE grb.guest_room_id = gr.id AND grb.status IN ('reserved', 'checked_in')) AS active_bookings
       FROM guest_rooms gr
       LEFT JOIN hostels h ON h.id = gr.hostel_id
      ORDER BY gr.room_number`
  );
  ok(res, rooms);
});

/** POST /api/guest-rooms  create guest room master */
router.post('/', authorize('hostels.manage'),
  validate(z.object({
    roomNumber: z.string().trim().min(2).max(20),
    hostelId: z.coerce.number().int().positive().optional().nullable(),
    capacity: z.coerce.number().int().min(1).max(10).default(2),
    isAc: z.boolean().default(true),
    notes: z.string().trim().max(255).optional(),
  })),
  async (req, res) => {
    const b = req.body;
    const dup = await db.one('SELECT id FROM guest_rooms WHERE room_number = ?', [b.roomNumber]);
    if (dup) throw conflict(`Guest room ${b.roomNumber} already exists`, 'DUPLICATE_ROOM');

    const [r] = await db.pool.query(
      `INSERT INTO guest_rooms (room_number, hostel_id, capacity, is_ac, notes) VALUES (?,?,?,?,?)`,
      [b.roomNumber, b.hostelId || null, b.capacity, b.isAc ? 1 : 0, b.notes || null]
    );
    await audit(req, { action: 'GUEST_ROOM_CREATED', module: 'guest_rooms', recordId: r.insertId, summary: `Created guest room ${b.roomNumber}`, newValue: b });
    created(res, { id: r.insertId, roomNumber: b.roomNumber });
  });

/** GET /api/guest-rooms/available  check guest room availability for a date range */
router.get('/available', authorize('hostels.view', 'allocations.manage'), async (req, res) => {
  const checkIn = req.query.checkIn || toDateStr();
  const checkOut = req.query.checkOut || toDateStr();
  if (checkOut < checkIn) throw badRequest('Check-out date cannot precede check-in date', 'INVALID_DATES');

  const availableRooms = await db.query(
    `SELECT gr.*, h.name AS hostel_name
       FROM guest_rooms gr
       LEFT JOIN hostels h ON h.id = gr.hostel_id
      WHERE gr.status <> 'maintenance'
        AND gr.id NOT IN (
          SELECT guest_room_id FROM guest_room_bookings
           WHERE status IN ('reserved', 'checked_in')
             AND (check_in_date <= ? AND check_out_date >= ?)
        )
      ORDER BY gr.room_number`,
    [checkOut, checkIn]
  );
  ok(res, { checkIn, checkOut, count: availableRooms.length, rooms: availableRooms });
});

/** POST /api/guest-rooms/bookings  allocate guest room (ZERO fee enforced) */
router.post('/bookings', authorize('allocations.manage'),
  validate(z.object({
    guestRoomId: z.coerce.number().int().positive(),
    guestName: z.string().trim().min(3).max(120),
    guestPhone: z.string().trim().min(7).max(20),
    guestEmail: z.string().trim().email().optional().nullable(),
    purpose: z.string().trim().min(3).max(255),
    checkInDate: date,
    checkOutDate: date,
  })),
  async (req, res) => {
    const b = req.body;
    if (b.checkOutDate < b.checkInDate) throw badRequest('Check-out date cannot be before check-in date', 'INVALID_DATES');

    const room = await db.one('SELECT * FROM guest_rooms WHERE id = ?', [b.guestRoomId]);
    if (!room) throw notFound('Guest room');
    if (room.status === 'maintenance') throw conflict('Room is under maintenance', 'ROOM_UNAVAILABLE');

    // Check collision with overlapping active bookings
    const overlap = await db.one(
      `SELECT id, booking_code FROM guest_room_bookings
        WHERE guest_room_id = ? AND status IN ('reserved', 'checked_in')
          AND (check_in_date <= ? AND check_out_date >= ?)`,
      [b.guestRoomId, b.checkOutDate, b.checkInDate]
    );
    if (overlap) throw conflict(`Guest room is already booked for these dates (${overlap.booking_code})`, 'ROOM_OCCUPIED');

    const out = await db.transaction(async (conn) => {
      // Rule 10: Zero fee charged for guests
      const [r] = await conn.query(
        `INSERT INTO guest_room_bookings (booking_code, guest_room_id, guest_name, guest_phone, guest_email, purpose, check_in_date, check_out_date, fee_amount, booked_by_user_id)
         VALUES (?,?,?,?,?,?,?,?, 0.00, ?)`,
        [tempCode(), b.guestRoomId, b.guestName, b.guestPhone, b.guestEmail || null, b.purpose, b.checkInDate, b.checkOutDate, req.user.id]
      );
      const code = await assignCode(conn, 'guest_room_bookings', 'booking_code', 'GRB', r.insertId);
      await audit(req, { action: 'GUEST_ROOM_BOOKED', module: 'guest_rooms', recordId: r.insertId, summary: `Booked guest room ${room.room_number} for ${b.guestName} (Zero fee)`, newValue: b }, conn);
      return { id: r.insertId, bookingCode: code, feeAmount: 0.00 };
    });
    created(res, out);
  });

/** PATCH /api/guest-rooms/bookings/:id/check-in  mark guest arrival */
router.patch('/bookings/:id/check-in', authorize('allocations.manage'), async (req, res) => {
  const b = await db.one('SELECT * FROM guest_room_bookings WHERE id = ?', [req.params.id]);
  if (!b) throw notFound('Booking');
  if (b.status !== 'reserved') throw conflict(`Booking is currently ${b.status}`, 'INVALID_STATUS');

  await db.transaction(async (conn) => {
    await conn.query("UPDATE guest_room_bookings SET status = 'checked_in', actual_check_in = NOW() WHERE id = ?", [b.id]);
    await conn.query("UPDATE guest_rooms SET status = 'occupied' WHERE id = ?", [b.guest_room_id]);
    await audit(req, { action: 'GUEST_CHECKED_IN', module: 'guest_rooms', recordId: b.id, summary: `${b.booking_code}: ${b.guest_name} checked in` }, conn);
  });
  ok(res, { id: b.id, status: 'checked_in' });
});

/** PATCH /api/guest-rooms/bookings/:id/check-out  mark guest departure and free room */
router.patch('/bookings/:id/check-out', authorize('allocations.manage'), async (req, res) => {
  const b = await db.one('SELECT * FROM guest_room_bookings WHERE id = ?', [req.params.id]);
  if (!b) throw notFound('Booking');
  if (b.status !== 'checked_in') throw conflict(`Booking is currently ${b.status}`, 'INVALID_STATUS');

  await db.transaction(async (conn) => {
    await conn.query("UPDATE guest_room_bookings SET status = 'checked_out', actual_check_out = NOW() WHERE id = ?", [b.id]);
    await conn.query("UPDATE guest_rooms SET status = 'available' WHERE id = ?", [b.guest_room_id]);
    await audit(req, { action: 'GUEST_CHECKED_OUT', module: 'guest_rooms', recordId: b.id, summary: `${b.booking_code}: ${b.guest_name} checked out` }, conn);
  });
  ok(res, { id: b.id, status: 'checked_out' });
});

/** GET /api/guest-rooms/bookings  booking ledger & history report */
router.get('/bookings', authorize('allocations.manage', 'hostels.view'), async (req, res) => {
  const q = parseList(req.query, { sortable: { created: 'grb.created_at', checkIn: 'grb.check_in_date', status: 'grb.status' }, defaultSort: 'created' });
  const where = new Where()
    .addIf(q.status, 'grb.status = ?', q.status)
    .addIf(q.guestRoomId, 'grb.guest_room_id = ?', q.guestRoomId)
    .addIf(q.from, 'grb.check_in_date >= ?', q.from)
    .addIf(q.to, 'grb.check_out_date <= ?', q.to)
    .search(q.search, ['grb.booking_code', 'grb.guest_name', 'grb.guest_phone', 'gr.room_number']);

  paged(res, await paginate(db, {
    select: `grb.*, gr.room_number, gr.is_ac, u.name AS booked_by_name`,
    from: `FROM guest_room_bookings grb
           JOIN guest_rooms gr ON gr.id = grb.guest_room_id
           LEFT JOIN users u ON u.id = grb.booked_by_user_id`,
    where, ...q,
  }));
});

module.exports = router;

