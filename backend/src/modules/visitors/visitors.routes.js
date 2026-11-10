const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, conflict, forbidden, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { getSettings } = require('../../services/settings');
const { scopeHostel, isStudent, isAdmin } = require('../../utils/scope');
const { tempCode, assignCode } = require('../../utils/helpers');

router.use(authenticate);

const SELECT = `ve.*, v.name AS visitor_name, v.phone AS visitor_phone, v.id_proof_type, v.id_proof_number,
  s.name AS student_name, s.register_number, h.code AS hostel_code, r.room_number,
  ap.name AS approved_by_name, ci.name AS checked_in_by_name, co.name AS checked_out_by_name,
  TIMESTAMPDIFF(MINUTE, ve.entry_time, COALESCE(ve.exit_time, NOW())) AS minutes_inside`;
const FROM = `FROM visitor_entries ve JOIN visitors v ON v.id = ve.visitor_id JOIN students s ON s.id = ve.student_id
  JOIN hostels h ON h.id = ve.hostel_id
  LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active' LEFT JOIN rooms r ON r.id = ra.room_id
  LEFT JOIN users ap ON ap.id = ve.approved_by LEFT JOIN users ci ON ci.id = ve.checked_in_by LEFT JOIN users co ON co.id = ve.checked_out_by`;

async function withinVisitingHours() {
  const s = await getSettings();
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { ok: hm >= s.visitor_hours_start && hm <= s.visitor_hours_end, start: s.visitor_hours_start, end: s.visitor_hours_end };
}

async function assertCanCheckIn(override) {
  const hours = await withinVisitingHours();
  if (!hours.ok && !override) {
    throw conflict(`Outside visiting hours (${hours.start}–${hours.end}). Tick "override" and add remarks to allow entry.`, 'OUTSIDE_VISITING_HOURS');
  }
}

async function loadEntry(id, conn) {
  const e = await db.one(`SELECT ${SELECT}, s.user_id AS student_user_id ${FROM} WHERE ve.id = ? ${conn ? 'FOR UPDATE' : ''}`, [id], conn || db.pool);
  if (!e) throw notFound('Visitor entry');
  return e;
}

function assertScope(user, hostelId) {
  if (!isAdmin(user) && !user.hostelIds.includes(hostelId)) throw forbidden('This visitor entry is outside your hostel scope');
}

/** GET /api/visitors/lookup?phone=  returns a known visitor for quick entry */
router.get('/lookup', authorize('visitors.manage', 'visitors.request'), async (req, res) => {
  const phone = String(req.query.phone || '').trim();
  if (phone.length < 7) return ok(res, null);
  const v = await db.one('SELECT id, name, phone, id_proof_type, id_proof_number FROM visitors WHERE phone = ?', [phone]);
  if (v) {
    v.lastVisits = await db.query(
      `SELECT ve.created_at, ve.relationship, s.name AS student_name FROM visitor_entries ve JOIN students s ON s.id = ve.student_id
        WHERE ve.visitor_id = ? ORDER BY ve.created_at DESC LIMIT 5`, [v.id]);
  }
  ok(res, v);
});

/**
 * POST /api/visitors  register a visitor entry.
 * { name, phone, idProofType, idProofNumber, studentId (staff), relationship, purpose, expectedAt?, checkInNow?, override?, remarks? }
 */
router.post('/', authorize('visitors.manage', 'visitors.request'),
  validate(z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Invalid phone number'),
    idProofType: z.enum(['aadhaar', 'driving_license', 'voter_id', 'passport', 'pan', 'college_id', 'other']),
    idProofNumber: z.string().trim().min(4).max(40),
    studentId: z.coerce.number().int().positive().optional(),
    relationship: z.string().trim().min(2).max(40),
    purpose: z.string().trim().min(3).max(255),
    expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/).optional(),
    checkInNow: z.boolean().default(false),
    override: z.boolean().default(false),
    remarks: z.string().trim().max(255).optional(),
  })),
  async (req, res) => {
    const b = req.body;
    const student = isStudent(req.user);
    const studentId = student ? req.user.studentId : b.studentId;
    if (!studentId) throw badRequest('Select the student being visited', 'STUDENT_REQUIRED');
    if (student && b.checkInNow) throw forbidden('Only gate staff can check visitors in');
    if (!student && !req.user.permissions.has('visitors.manage')) throw forbidden();
    if (b.override && !b.remarks) throw badRequest('Remarks are required when overriding visiting hours', 'REMARKS_REQUIRED');

    const alloc = await db.one(
      `SELECT ra.hostel_id, s.name, s.user_id,
              EXISTS (SELECT 1 FROM leave_requests l WHERE l.student_id = s.id AND l.status = 'approved' AND l.returned_at IS NULL AND CURDATE() BETWEEN l.from_date AND l.to_date) AS on_leave
         FROM room_allocations ra JOIN students s ON s.id = ra.student_id WHERE ra.student_id = ? AND ra.status = 'active'`, [studentId]);
    if (!alloc) throw conflict('The student is not a current hostel resident', 'NOT_A_RESIDENT');
    if (!student) assertScope(req.user, alloc.hostel_id);
    if (b.checkInNow && alloc.on_leave) throw conflict(`${alloc.name} is currently on leave`, 'STUDENT_ON_LEAVE');
    if (b.checkInNow) await assertCanCheckIn(b.override);

    const out = await db.transaction(async (conn) => {
      await conn.query(
        `INSERT INTO visitors (name, phone, id_proof_type, id_proof_number) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), id_proof_type = VALUES(id_proof_type), id_proof_number = VALUES(id_proof_number)`,
        [b.name, b.phone, b.idProofType, b.idProofNumber]);
      const visitor = await db.one('SELECT id FROM visitors WHERE phone = ?', [b.phone], conn);
      const inside = await db.one("SELECT id FROM visitor_entries WHERE visitor_id = ? AND status = 'checked_in'", [visitor.id], conn);
      if (b.checkInNow && inside) throw conflict('This visitor is already checked in', 'VISITOR_ALREADY_INSIDE');
      const [r] = await conn.query(
        `INSERT INTO visitor_entries (pass_code, visitor_id, student_id, hostel_id, relationship, purpose, expected_at, entry_time, status, approved_by, checked_in_by, remarks)
         VALUES (?,?,?,?,?,?,?,IF(?, NOW(), NULL),?,?,?,?)`,
        [tempCode(), visitor.id, studentId, alloc.hostel_id, b.relationship, b.purpose, b.expectedAt?.replace('T', ' ') || null,
          b.checkInNow ? 1 : 0, b.checkInNow ? 'checked_in' : 'expected',
          student ? null : req.user.id, b.checkInNow ? req.user.id : null,
          b.override ? `Visiting-hours override: ${b.remarks}` : b.remarks || null]);
      const code = await assignCode(conn, 'visitor_entries', 'pass_code', 'VP', r.insertId);
      if (b.checkInNow) {
        await notify(alloc.user_id, { type: 'visitor_arrived', title: 'You have a visitor', message: `${b.name} (${b.relationship}) is at the hostel.`, link: '/my/visitors' }, conn);
      }
      await audit(req, { action: b.checkInNow ? 'VISITOR_CHECKED_IN' : 'VISITOR_REGISTERED', module: 'visitors', recordId: r.insertId, summary: `${code}: ${b.name} visiting ${alloc.name}${b.override ? ' (hours override)' : ''}`, newValue: { ...b, idProofNumber: `****${b.idProofNumber.slice(-4)}` } }, conn);
      return { id: r.insertId, passCode: code, status: b.checkInNow ? 'checked_in' : 'expected' };
    });
    created(res, out);
  });

/** POST /api/visitors/:id/check-in  { override?, remarks? } */
router.post('/:id/check-in', authorize('visitors.manage'),
  validate(z.object({ override: z.boolean().default(false), remarks: z.string().trim().max(255).optional() })),
  async (req, res) => {
    if (req.body.override && !req.body.remarks) throw badRequest('Remarks are required when overriding visiting hours', 'REMARKS_REQUIRED');
    await assertCanCheckIn(req.body.override);
    await db.transaction(async (conn) => {
      const e = await loadEntry(req.params.id, conn);
      assertScope(req.user, e.hostel_id);
      if (e.status !== 'expected') throw conflict(`Visitor is already ${e.status.replace('_', ' ')}`, 'INVALID_TRANSITION');
      const inside = await db.one("SELECT pass_code FROM visitor_entries WHERE visitor_id = ? AND status = 'checked_in'", [e.visitor_id], conn);
      if (inside) throw conflict(`This visitor is already inside on pass ${inside.pass_code}`, 'VISITOR_ALREADY_INSIDE');
      const leave = await db.one(
        "SELECT leave_code FROM leave_requests WHERE student_id = ? AND status = 'approved' AND returned_at IS NULL AND CURDATE() BETWEEN from_date AND to_date", [e.student_id], conn);
      if (leave) throw conflict(`${e.student_name} is on leave (${leave.leave_code})`, 'STUDENT_ON_LEAVE');
      await conn.query(
        `UPDATE visitor_entries SET status = 'checked_in', entry_time = NOW(), checked_in_by = ?, approved_by = COALESCE(approved_by, ?),
                remarks = CONCAT_WS(' | ', remarks, ?) WHERE id = ?`,
        [req.user.id, req.user.id, req.body.override ? `Visiting-hours override: ${req.body.remarks}` : req.body.remarks || null, e.id]);
      await notify(e.student_user_id, { type: 'visitor_arrived', title: 'You have a visitor', message: `${e.visitor_name} (${e.relationship}) is at the hostel.`, link: '/my/visitors' }, conn);
      await audit(req, { action: 'VISITOR_CHECKED_IN', module: 'visitors', recordId: e.id, summary: `${e.pass_code}: ${e.visitor_name} checked in to meet ${e.student_name}` }, conn);
    });
    ok(res, { id: Number(req.params.id), status: 'checked_in' });
  });

/** POST /api/visitors/:id/check-out */
router.post('/:id/check-out', authorize('visitors.manage'), async (req, res) => {
  await db.transaction(async (conn) => {
    const e = await loadEntry(req.params.id, conn);
    assertScope(req.user, e.hostel_id);
    if (e.status !== 'checked_in') throw conflict('Only visitors who are inside can be checked out', 'INVALID_TRANSITION');
    await conn.query("UPDATE visitor_entries SET status = 'checked_out', exit_time = NOW(), checked_out_by = ? WHERE id = ?", [req.user.id, e.id]);
    await audit(req, { action: 'VISITOR_CHECKED_OUT', module: 'visitors', recordId: e.id, summary: `${e.pass_code}: ${e.visitor_name} checked out after ${e.minutes_inside} min` }, conn);
  });
  ok(res, { id: Number(req.params.id), status: 'checked_out' });
});

/** POST /api/visitors/:id/cancel */
router.post('/:id/cancel', authorize('visitors.manage', 'visitors.request'), async (req, res) => {
  await db.transaction(async (conn) => {
    const e = await loadEntry(req.params.id, conn);
    if (isStudent(req.user)) { if (e.student_id !== req.user.studentId) throw forbidden(); } else assertScope(req.user, e.hostel_id);
    if (e.status !== 'expected') throw conflict('Only expected visits can be cancelled', 'INVALID_TRANSITION');
    await conn.query("UPDATE visitor_entries SET status = 'cancelled' WHERE id = ?", [e.id]);
    await audit(req, { action: 'VISITOR_CANCELLED', module: 'visitors', recordId: e.id, summary: `${e.pass_code} cancelled` }, conn);
  });
  ok(res, { id: Number(req.params.id), status: 'cancelled' });
});

/** GET /api/visitors/current  visitors currently inside (oldest first) */
router.get('/current', authorize('visitors.view'), async (req, res) => {
  const where = new Where().add("ve.status = 'checked_in'").addIf(req.query.hostelId, 've.hostel_id = ?', req.query.hostelId);
  scopeHostel(where, req.user, 've.hostel_id');
  ok(res, await db.query(`SELECT ${SELECT} ${FROM} ${where.sql} ORDER BY ve.entry_time`, where.params));
});

/** GET /api/visitors  register ?status&hostelId&from&to&search (students: own visitors) */
router.get('/', async (req, res) => {
  if (!isStudent(req.user) && !req.user.permissions.has('visitors.view')) throw forbidden();
  const q = parseList(req.query, { sortable: { created: 've.created_at', entry: 've.entry_time', expected: 've.expected_at' }, defaultSort: 'created' });
  const where = new Where()
    .addIf(q.status, 've.status = ?', q.status)
    .addIf(q.hostelId, 've.hostel_id = ?', q.hostelId)
    .addIf(q.from, 'COALESCE(ve.entry_time, ve.expected_at, ve.created_at) >= ?', q.from)
    .addIf(q.to, 'COALESCE(ve.entry_time, ve.expected_at, ve.created_at) < DATE_ADD(?, INTERVAL 1 DAY)', q.to)
    .search(q.search, ['v.name', 'v.phone', 've.pass_code', 's.name', 's.register_number']);
  if (isStudent(req.user)) where.add('ve.student_id = ?', req.user.studentId || 0);
  else scopeHostel(where, req.user, 've.hostel_id');
  const result = await paginate(db, { select: SELECT, from: FROM, where, ...q });
  if (isStudent(req.user)) result.data.forEach((r) => { r.id_proof_number = `****${String(r.id_proof_number).slice(-4)}`; });
  paged(res, result);
});

module.exports = router;
