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

const CATEGORIES = ['electrical', 'plumbing', 'cleaning', 'furniture', 'structural', 'internet', 'pest_control', 'other'];
const NEXT = { open: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled', 'open'], completed: [], cancelled: [] };

async function setRoomMaintenance(conn, req, roomId, reason) {
  const room = await db.one('SELECT id, room_number, status FROM rooms WHERE id = ? FOR UPDATE', [roomId], conn);
  if (room.status !== 'active') return;
  await conn.query("UPDATE rooms SET status = 'maintenance', status_reason = ? WHERE id = ?", [reason, roomId]);
  await conn.query("UPDATE beds SET status = 'maintenance' WHERE room_id = ? AND status = 'available'", [roomId]);
  const occupants = await db.query(
    "SELECT s.user_id FROM room_allocations ra JOIN students s ON s.id = ra.student_id WHERE ra.room_id = ? AND ra.status = 'active'", [roomId], conn);
  await notify(occupants.map((o) => o.user_id), {
    type: 'room_maintenance', title: `Maintenance scheduled in room ${room.room_number}`, message: reason, link: '/my/hostel',
  }, conn);
}

// Reactivates the room once no other open request is blocking it.
async function releaseRoomIfClear(conn, roomId, excludeId) {
  const other = await db.one(
    "SELECT COUNT(*) AS n FROM maintenance_requests WHERE room_id = ? AND id <> ? AND blocks_room = 1 AND status IN ('open','in_progress')", [roomId, excludeId], conn);
  if (other.n) return false;
  const room = await db.one('SELECT status FROM rooms WHERE id = ? FOR UPDATE', [roomId], conn);
  if (room.status !== 'maintenance') return false;
  await conn.query("UPDATE rooms SET status = 'active', status_reason = NULL WHERE id = ?", [roomId]);
  await conn.query("UPDATE beds SET status = 'available' WHERE room_id = ? AND status = 'maintenance'", [roomId]);
  return true;
}

/** GET /api/maintenance  ?status&hostelId&category&priority&assignedTo&search&open=true */
router.get('/', authorize('maintenance.view'), async (req, res) => {
  const q = parseList(req.query, { sortable: { created: 'm.created_at', priority: "FIELD(m.priority,'critical','high','medium','low')", status: 'm.status' }, defaultSort: 'created' });
  const where = new Where()
    .addIf(q.status, 'm.status = ?', q.status)
    .addIf(q.hostelId, 'm.hostel_id = ?', q.hostelId)
    .addIf(q.category, 'm.category = ?', q.category)
    .addIf(q.priority, 'm.priority = ?', q.priority)
    .addIf(q.assignedTo, 'm.assigned_to = ?', q.assignedTo)
    .addIf(q.from, 'm.created_at >= ?', q.from)
    .addIf(q.to, 'm.created_at < DATE_ADD(?, INTERVAL 1 DAY)', q.to)
    .search(q.search, ['m.request_code', 'm.title', 'r.room_number']);
  if (q.open === 'true') where.add("m.status IN ('open','in_progress')");
  scopeHostel(where, req.user, 'm.hostel_id');
  paged(res, await paginate(db, {
    select: `m.*, h.code AS hostel_code, r.room_number, b.bed_code, c.complaint_code, a.name AS assigned_to_name, rq.name AS requested_by_name,
             DATEDIFF(NOW(), m.created_at) AS age_days`,
    from: `FROM maintenance_requests m JOIN hostels h ON h.id = m.hostel_id LEFT JOIN rooms r ON r.id = m.room_id LEFT JOIN beds b ON b.id = m.bed_id
           LEFT JOIN complaints c ON c.id = m.complaint_id LEFT JOIN users a ON a.id = m.assigned_to LEFT JOIN users rq ON rq.id = m.requested_by`,
    where, ...q,
  }));
});

/** POST /api/maintenance  { hostelId?, roomId?, bedId?, complaintId?, category, priority, title, description, blocksRoom, assignedTo? } */
router.post('/', authorize('maintenance.manage'),
  validate(z.object({
    hostelId: z.coerce.number().int().positive().optional(),
    roomId: z.coerce.number().int().positive().optional().nullable(),
    bedId: z.coerce.number().int().positive().optional().nullable(),
    complaintId: z.coerce.number().int().positive().optional().nullable(),
    category: z.enum(CATEGORIES),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().max(1000).optional(),
    blocksRoom: z.coerce.boolean().default(false),
    assignedTo: z.coerce.number().int().positive().optional().nullable(),
  })),
  async (req, res) => {
    const b = req.body;
    let hostelId = b.hostelId;
    let roomId = b.roomId || null;
    if (b.complaintId) {
      const c = await db.one('SELECT hostel_id, room_id FROM complaints WHERE id = ?', [b.complaintId]);
      if (!c) throw notFound('Complaint');
      hostelId = c.hostel_id; roomId = roomId || c.room_id;
    }
    if (b.bedId) {
      const bed = await db.one('SELECT b.room_id, r.hostel_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?', [b.bedId]);
      if (!bed) throw notFound('Bed');
      roomId = bed.room_id; hostelId = bed.hostel_id;
    }
    if (roomId && !hostelId) hostelId = (await db.one('SELECT hostel_id FROM rooms WHERE id = ?', [roomId]))?.hostel_id;
    if (roomId) {
      const room = await db.one('SELECT hostel_id FROM rooms WHERE id = ?', [roomId]);
      if (!room || room.hostel_id !== hostelId) throw badRequest('Room does not belong to the hostel', 'INVALID_ROOM');
    }
    if (!hostelId) throw badRequest('hostelId, roomId, bedId or complaintId is required', 'LOCATION_REQUIRED');
    if (b.blocksRoom && !roomId) throw badRequest('Select a room to block', 'ROOM_REQUIRED');
    assertHostelAccess(req.user, hostelId);

    const out = await db.transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO maintenance_requests (request_code, hostel_id, room_id, bed_id, complaint_id, category, priority, title, description, blocks_room, assigned_to, requested_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tempCode(), hostelId, roomId, b.bedId || null, b.complaintId || null, b.category, b.priority, b.title, b.description || null, b.blocksRoom ? 1 : 0, b.assignedTo || null, req.user.id]);
      const code = await assignCode(conn, 'maintenance_requests', 'request_code', 'MNT', r.insertId);
      if (b.blocksRoom) await setRoomMaintenance(conn, req, roomId, `${code}: ${b.title}`);
      if (b.bedId) await conn.query("UPDATE beds SET status = 'maintenance' WHERE id = ? AND status = 'available'", [b.bedId]);
      if (b.complaintId) {
        await conn.query("INSERT INTO complaint_updates (complaint_id, user_id, update_type, note) VALUES (?,?, 'note', ?)", [b.complaintId, req.user.id, `Maintenance task ${code} created`]);
      }
      if (b.assignedTo) await notify(b.assignedTo, { type: 'maintenance_assigned', title: `Maintenance ${code} assigned`, message: b.title, link: '/maintenance' }, conn);
      await audit(req, { action: 'MAINTENANCE_CREATED', module: 'maintenance', recordId: r.insertId, summary: `${code}: ${b.title}${b.blocksRoom ? ' (room blocked)' : ''}`, newValue: b }, conn);
      return { id: r.insertId, requestCode: code };
    });
    created(res, out);
  });

/** PATCH /api/maintenance/:id  { status?, assignedTo?, notes?, cost? } */
router.patch('/:id', authorize('maintenance.manage'),
  validate(z.object({
    status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
    assignedTo: z.coerce.number().int().positive().optional().nullable(),
    notes: z.string().trim().max(1000).optional(),
    cost: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  })),
  async (req, res) => {
    const b = req.body;
    const out = await db.transaction(async (conn) => {
      const m = await db.one('SELECT * FROM maintenance_requests WHERE id = ? FOR UPDATE', [req.params.id], conn);
      if (!m) throw notFound('Maintenance request');
      assertHostelAccess(req.user, m.hostel_id);
      if (b.status && b.status !== m.status && !NEXT[m.status].includes(b.status)) {
        throw conflict(`Cannot move request from "${m.status}" to "${b.status}"`, 'INVALID_TRANSITION');
      }
      if (b.status === 'completed' && !b.notes && !m.notes) throw badRequest('Add completion notes', 'NOTE_REQUIRED');
      const status = b.status || m.status;
      await conn.query(
        `UPDATE maintenance_requests SET status = ?, assigned_to = ?, notes = ?, cost = ?,
                started_at = IF(? = 'in_progress' AND started_at IS NULL, NOW(), started_at),
                completed_at = IF(? = 'completed', NOW(), completed_at) WHERE id = ?`,
        [status, b.assignedTo === undefined ? m.assigned_to : b.assignedTo, b.notes ?? m.notes, b.cost === undefined ? m.cost : b.cost, status, status, m.id]);
      let roomReleased = false;
      if (['completed', 'cancelled'].includes(status) && m.status !== status) {
        if (m.blocks_room && m.room_id) roomReleased = await releaseRoomIfClear(conn, m.room_id, m.id);
        if (m.bed_id) await conn.query("UPDATE beds b JOIN rooms r ON r.id = b.room_id SET b.status = 'available' WHERE b.id = ? AND b.status = 'maintenance' AND r.status = 'active'", [m.bed_id]);
        if (m.complaint_id) {
          await conn.query("INSERT INTO complaint_updates (complaint_id, user_id, update_type, note) VALUES (?,?, 'note', ?)",
            [m.complaint_id, req.user.id, `Maintenance ${m.request_code} ${status}${b.notes ? `: ${b.notes}` : ''}`]);
        }
      }
      if (b.assignedTo && b.assignedTo !== m.assigned_to) await notify(b.assignedTo, { type: 'maintenance_assigned', title: `Maintenance ${m.request_code} assigned`, message: m.title, link: '/maintenance' }, conn);
      await audit(req, { action: 'MAINTENANCE_UPDATED', module: 'maintenance', recordId: m.id, summary: `${m.request_code}: ${m.status} → ${status}${roomReleased ? ' (room reactivated)' : ''}`, oldValue: { status: m.status, assignedTo: m.assigned_to }, newValue: b }, conn);
      return { id: m.id, status, roomReleased };
    });
    ok(res, out);
  });

module.exports = router;
