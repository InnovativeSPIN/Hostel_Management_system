const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { toDateTimeStr } = require('../../utils/helpers');

router.use(authenticate);

const ROOM_TYPES = ['single', 'double', 'suite', 'dormitory'];
const ROOM_STATUSES = ['available', 'occupied', 'maintenance', 'blocked'];
const ID_PROOF_TYPES = ['aadhaar', 'driving_license', 'voter_id', 'passport', 'pan', 'other'];

/**
 * GET /api/guest/report
 * Returns overall occupancy metrics, live status, and statistics
 */
router.get('/report', authorize('hostels.view', 'hostels.manage', 'allocations.manage'), async (_req, res) => {
  const [roomStats] = await db.query(`
    SELECT
      COUNT(*) AS total_rooms,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_rooms,
      SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied_rooms,
      SUM(CASE WHEN status IN ('maintenance', 'blocked') THEN 1 ELSE 0 END) AS maintenance_rooms,
      SUM(capacity) AS total_capacity
    FROM guest_rooms
  `);

  const [bookingStats] = await db.query(`
    SELECT
      COUNT(*) AS total_bookings,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_bookings,
      SUM(CASE WHEN status = 'active' THEN number_of_guests ELSE 0 END) AS active_guests_count,
      SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) AS completed_stays
    FROM guest_allocations
  `);

  const byType = await db.query(`
    SELECT
      room_type,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied
    FROM guest_rooms
    GROUP BY room_type
  `);

  const recentBookings = await db.query(`
    SELECT
      ga.id, ga.booking_code, ga.guest_name, ga.phone, ga.number_of_guests,
      ga.check_in_at, ga.expected_check_out_at, ga.actual_check_out_at, ga.status,
      gr.room_number, gr.block_name, gr.room_type, gr.is_ac
    FROM guest_allocations ga
    JOIN guest_rooms gr ON gr.id = ga.guest_room_id
    ORDER BY ga.id DESC
    LIMIT 5
  `);

  ok(res, {
    totalRooms: Number(roomStats?.total_rooms || 0),
    availableRooms: Number(roomStats?.available_rooms || 0),
    occupiedRooms: Number(roomStats?.occupied_rooms || 0),
    maintenanceRooms: Number(roomStats?.maintenance_rooms || 0),
    totalCapacity: Number(roomStats?.total_capacity || 0),
    totalBookings: Number(bookingStats?.total_bookings || 0),
    activeBookings: Number(bookingStats?.active_bookings || 0),
    activeGuestsCount: Number(bookingStats?.active_guests_count || 0),
    completedStays: Number(bookingStats?.completed_stays || 0),
    byType,
    recentBookings,
    feePolicy: 'zero_fee (Institutional Complimentary / Guest Ledger Free)',
  });
});

/**
 * GET /api/guest/rooms
 * List guest rooms with live occupancy details
 */
router.get('/rooms', authorize('hostels.view', 'hostels.manage', 'allocations.manage'), async (req, res) => {
  const { hostelId, blockName, status, isAc, roomType, search } = req.query;

  const where = new Where();
  where.addIf(hostelId, 'gr.hostel_id = ?', hostelId)
    .addIf(blockName, 'gr.block_name = ?', blockName)
    .addIf(status, 'gr.status = ?', status)
    .addIf(roomType, 'gr.room_type = ?', roomType);

  if (isAc !== undefined && isAc !== '') {
    where.add('gr.is_ac = ?', isAc === 'true' || isAc === '1' ? 1 : 0);
  }

  if (search) {
    where.search(search, ['gr.room_number', 'gr.block_name', 'gr.amenities', 'gr.remarks']);
  }

  const sql = `
    SELECT
      gr.*,
      h.name AS hostel_name,
      h.code AS hostel_code,
      ga.id AS active_allocation_id,
      ga.booking_code AS current_booking_code,
      ga.guest_name AS current_guest_name,
      ga.phone AS current_guest_phone,
      ga.number_of_guests AS current_number_of_guests,
      ga.purpose AS current_purpose,
      ga.check_in_at AS current_check_in,
      ga.expected_check_out_at AS current_expected_check_out,
      s.name AS current_related_student_name
    FROM guest_rooms gr
    LEFT JOIN hostels h ON h.id = gr.hostel_id
    LEFT JOIN guest_allocations ga ON ga.guest_room_id = gr.id AND ga.status = 'active'
    LEFT JOIN students s ON s.id = ga.related_student_id
    ${where.sql}
    ORDER BY gr.block_name ASC, gr.room_number ASC
  `;

  const rooms = await db.query(sql, where.params);
  ok(res, rooms);
});

/**
 * POST /api/guest/rooms
 * Create guest room master
 */
router.post('/rooms', authorize('hostels.manage', 'allocations.manage'),
  validate(z.object({
    roomNumber: z.string().trim().min(1).max(20),
    hostelId: z.coerce.number().int().positive().nullable().optional(),
    blockName: z.string().trim().min(1).max(50).default('Guest Block'),
    floorNumber: z.coerce.number().int().min(0).max(20).default(1),
    roomType: z.enum(ROOM_TYPES).default('double'),
    isAc: z.coerce.boolean().default(true),
    capacity: z.coerce.number().int().min(1).max(20).default(2),
    amenities: z.string().trim().max(255).optional(),
    remarks: z.string().trim().max(255).optional(),
  })),
  async (req, res) => {
    const { roomNumber, hostelId, blockName, floorNumber, roomType, isAc, capacity, amenities, remarks } = req.body;

    const existing = await db.one(
      'SELECT id FROM guest_rooms WHERE room_number = ? AND block_name = ?',
      [roomNumber, blockName]
    );
    if (existing) {
      throw conflict(`Guest room ${roomNumber} already exists in ${blockName}`);
    }

    const result = await db.query(
      `INSERT INTO guest_rooms (room_number, hostel_id, block_name, floor_number, room_type, is_ac, capacity, amenities, status, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
      [roomNumber, hostelId || null, blockName, floorNumber, roomType, isAc ? 1 : 0, capacity, amenities || null, remarks || null]
    );

    const createdRoom = await db.one('SELECT * FROM guest_rooms WHERE id = ?', [result.insertId]);

    await audit(req, {
      action: 'create',
      module: 'guest_rooms',
      recordId: result.insertId,
      summary: `Created guest room ${roomNumber} in ${blockName}`,
      newValue: createdRoom,
    });

    created(res, createdRoom);
  }
);

/**
 * PATCH /api/guest/rooms/:id
 * Update guest room master
 */
router.patch('/rooms/:id', authorize('hostels.manage', 'allocations.manage'),
  validate(z.object({
    roomNumber: z.string().trim().min(1).max(20).optional(),
    hostelId: z.coerce.number().int().positive().nullable().optional(),
    blockName: z.string().trim().min(1).max(50).optional(),
    floorNumber: z.coerce.number().int().min(0).max(20).optional(),
    roomType: z.enum(ROOM_TYPES).optional(),
    isAc: z.coerce.boolean().optional(),
    capacity: z.coerce.number().int().min(1).max(20).optional(),
    amenities: z.string().trim().max(255).optional(),
    status: z.enum(ROOM_STATUSES).optional(),
    remarks: z.string().trim().max(255).optional(),
  })),
  async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.one('SELECT * FROM guest_rooms WHERE id = ?', [id]);
    if (!existing) throw notFound('Guest room');

    const body = req.body;

    if (body.status && body.status !== existing.status) {
      if (['maintenance', 'blocked'].includes(body.status)) {
        const activeAlloc = await db.one('SELECT id FROM guest_allocations WHERE guest_room_id = ? AND status = "active"', [id]);
        if (activeAlloc) {
          throw conflict(`Cannot set room to ${body.status} while it is occupied by an active guest allocation`);
        }
      }
    }

    const updates = [];
    const params = [];

    if (body.roomNumber !== undefined) { updates.push('room_number = ?'); params.push(body.roomNumber); }
    if (body.hostelId !== undefined) { updates.push('hostel_id = ?'); params.push(body.hostelId); }
    if (body.blockName !== undefined) { updates.push('block_name = ?'); params.push(body.blockName); }
    if (body.floorNumber !== undefined) { updates.push('floor_number = ?'); params.push(body.floorNumber); }
    if (body.roomType !== undefined) { updates.push('room_type = ?'); params.push(body.roomType); }
    if (body.isAc !== undefined) { updates.push('is_ac = ?'); params.push(body.isAc ? 1 : 0); }
    if (body.capacity !== undefined) { updates.push('capacity = ?'); params.push(body.capacity); }
    if (body.amenities !== undefined) { updates.push('amenities = ?'); params.push(body.amenities); }
    if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
    if (body.remarks !== undefined) { updates.push('remarks = ?'); params.push(body.remarks); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE guest_rooms SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const updated = await db.one('SELECT * FROM guest_rooms WHERE id = ?', [id]);

    await audit(req, {
      action: 'update',
      module: 'guest_rooms',
      recordId: id,
      summary: `Updated guest room ${existing.room_number}`,
      oldValue: existing,
      newValue: updated,
    });

    ok(res, updated);
  }
);

/**
 * GET /api/guest/allocations
 * List allocations with pagination and filters
 */
router.get('/allocations', authorize('hostels.view', 'hostels.manage', 'allocations.manage'), async (req, res) => {
  const q = parseList(req.query, {
    sortable: {
      id: 'ga.id',
      check_in: 'ga.check_in_at',
      expected_check_out: 'ga.expected_check_out_at',
      guest_name: 'ga.guest_name',
      status: 'ga.status',
    },
    defaultSort: 'id',
    defaultOrder: 'desc',
  });

  const where = new Where();
  where.addIf(req.query.status, 'ga.status = ?', req.query.status)
    .addIf(req.query.guestRoomId, 'ga.guest_room_id = ?', req.query.guestRoomId)
    .addIf(req.query.from, 'DATE(ga.check_in_at) >= ?', req.query.from)
    .addIf(req.query.to, 'DATE(ga.check_in_at) <= ?', req.query.to);

  if (q.search) {
    where.search(q.search, ['ga.booking_code', 'ga.guest_name', 'ga.phone', 'ga.id_proof_number', 'ga.purpose']);
  }

  const result = await paginate(db, {
    select: `
      ga.*,
      gr.room_number,
      gr.block_name,
      gr.room_type,
      gr.is_ac,
      gr.capacity,
      h.name AS hostel_name,
      h.code AS hostel_code,
      s.name AS related_student_name,
      s.register_number AS related_student_register_number,
      u.name AS allocated_by_name
    `,
    from: `
      FROM guest_allocations ga
      JOIN guest_rooms gr ON gr.id = ga.guest_room_id
      LEFT JOIN hostels h ON h.id = gr.hostel_id
      LEFT JOIN students s ON s.id = ga.related_student_id
      LEFT JOIN users u ON u.id = ga.allocated_by
    `,
    where,
    orderBy: q.orderBy,
    limit: q.limit,
    offset: q.offset,
    page: q.page,
  });

  paged(res, result);
});

/**
 * POST /api/guest/allocations
 * Book / Allocate a guest room.
 * STRICT ZERO-FEE: Never creates records in student_fees or payments.
 */
router.post('/allocations', authorize('hostels.manage', 'allocations.manage'),
  validate(z.object({
    guestRoomId: z.coerce.number().int().positive(),
    guestName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().email().nullable().optional(),
    idProofType: z.enum(ID_PROOF_TYPES).default('aadhaar'),
    idProofNumber: z.string().trim().min(3).max(50),
    purpose: z.string().trim().min(2).max(255),
    relatedStudentId: z.coerce.number().int().positive().nullable().optional(),
    relationshipToStudent: z.string().trim().max(50).nullable().optional(),
    numberOfGuests: z.coerce.number().int().min(1).max(20).default(1),
    checkInAt: z.string().optional(),
    expectedCheckOutAt: z.string().min(1, 'Expected check-out is required'),
    remarks: z.string().trim().max(500).optional(),
  })),
  async (req, res) => {
    const {
      guestRoomId,
      guestName,
      phone,
      email,
      idProofType,
      idProofNumber,
      purpose,
      relatedStudentId,
      relationshipToStudent,
      numberOfGuests,
      checkInAt,
      expectedCheckOutAt,
      remarks,
    } = req.body;

    const room = await db.one('SELECT * FROM guest_rooms WHERE id = ?', [guestRoomId]);
    if (!room) throw notFound('Guest room');

    if (room.status !== 'available') {
      throw conflict(`Guest room ${room.room_number} is not available (current status: ${room.status})`);
    }

    const activeAlloc = await db.one(
      'SELECT id FROM guest_allocations WHERE guest_room_id = ? AND status = "active"',
      [guestRoomId]
    );
    if (activeAlloc) {
      throw conflict(`Guest room ${room.room_number} is already occupied by active booking #${activeAlloc.id}`);
    }

    if (relatedStudentId) {
      const student = await db.one('SELECT id, name FROM students WHERE id = ?', [relatedStudentId]);
      if (!student) throw notFound('Related student');
    }

    const checkInTime = checkInAt ? new Date(checkInAt) : new Date();
    const expectedCheckOutTime = new Date(expectedCheckOutAt);

    if (isNaN(checkInTime.getTime())) throw badRequest('Invalid check-in date/time');
    if (isNaN(expectedCheckOutTime.getTime())) throw badRequest('Invalid expected check-out date/time');
    if (expectedCheckOutTime <= checkInTime) {
      throw badRequest('Expected check-out must be after check-in time');
    }

    const checkInFormatted = toDateTimeStr(checkInTime);
    const expectedCheckOutFormatted = toDateTimeStr(expectedCheckOutTime);
    const bookingCode = `GBK-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // Perform transaction: Insert allocation & set room to occupied
    // STRICT ZERO-FEE: No insertion into student_fees, fee_collections, or payments!
    const alloc = await db.transaction(async (conn) => {
      const [resAlloc] = await conn.query(
        `INSERT INTO guest_allocations
          (booking_code, guest_room_id, guest_name, phone, email, id_proof_type, id_proof_number,
           purpose, related_student_id, relationship_to_student, number_of_guests,
           check_in_at, expected_check_out_at, status, remarks, allocated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          bookingCode,
          guestRoomId,
          guestName,
          phone,
          email || null,
          idProofType,
          idProofNumber,
          purpose,
          relatedStudentId || null,
          relationshipToStudent || null,
          numberOfGuests,
          checkInFormatted,
          expectedCheckOutFormatted,
          remarks || null,
          req.user?.id || null,
        ]
      );

      await conn.query('UPDATE guest_rooms SET status = "occupied" WHERE id = ?', [guestRoomId]);

      const [record] = await conn.query(
        `SELECT ga.*, gr.room_number, gr.block_name, gr.room_type, gr.is_ac
         FROM guest_allocations ga
         JOIN guest_rooms gr ON gr.id = ga.guest_room_id
         WHERE ga.id = ?`,
        [resAlloc.insertId]
      );
      return record[0];
    });

    await audit(req, {
      action: 'create',
      module: 'guest_allocations',
      recordId: alloc.id,
      summary: `Allocated guest room ${room.room_number} to ${guestName} (${bookingCode}) [Zero Fee]`,
      newValue: alloc,
    });

    created(res, alloc);
  }
);

/**
 * PATCH /api/guest/allocations/:id/check-out
 * Check out an active guest allocation and release the room to 'available'
 */
router.patch('/allocations/:id/check-out', authorize('hostels.manage', 'allocations.manage'),
  validate(z.object({
    remarks: z.string().trim().max(500).optional(),
  })),
  async (req, res) => {
    const id = Number(req.params.id);
    const alloc = await db.one('SELECT * FROM guest_allocations WHERE id = ?', [id]);
    if (!alloc) throw notFound('Guest allocation');

    if (alloc.status !== 'active') {
      throw conflict(`Allocation #${id} is already ${alloc.status}`);
    }

    const checkOutTime = toDateTimeStr(new Date());
    const checkoutRemarks = req.body.remarks ? ` [Check-out note: ${req.body.remarks}]` : '';
    const newRemarks = (alloc.remarks || '') + checkoutRemarks;

    await db.transaction(async (conn) => {
      await conn.query(
        `UPDATE guest_allocations
         SET status = 'checked_out',
             actual_check_out_at = ?,
             remarks = ?
         WHERE id = ?`,
        [checkOutTime, newRemarks || null, id]
      );

      await conn.query('UPDATE guest_rooms SET status = "available" WHERE id = ?', [alloc.guest_room_id]);
    });

    const updated = await db.one(
      `SELECT ga.*, gr.room_number, gr.block_name
       FROM guest_allocations ga
       JOIN guest_rooms gr ON gr.id = ga.guest_room_id
       WHERE ga.id = ?`,
      [id]
    );

    await audit(req, {
      action: 'check_out',
      module: 'guest_allocations',
      recordId: id,
      summary: `Checked out guest ${alloc.guest_name} from room #${alloc.guest_room_id} (${alloc.booking_code})`,
      oldValue: alloc,
      newValue: updated,
    });

    ok(res, updated);
  }
);

module.exports = router;
