const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { scopeHostel } = require('../../utils/scope');
const { notify } = require('../../services/notify');
const svc = require('./allocations.service');

router.use(authenticate);

const id = z.coerce.number().int().positive();

/** POST /api/allocations  { studentId, bedId, remarks? } */
router.post('/', authorize('allocations.manage'),
  validate(z.object({ studentId: id, bedId: id, remarks: z.string().trim().max(255).optional() })),
  async (req, res) => created(res, await svc.allocate(req, req.body)));

/** GET /api/allocations/suggest?studentId=  ranked suitable beds */
router.get('/suggest', authorize('allocations.manage'), async (req, res) => {
  ok(res, await svc.suggestBeds(req.user, id.parse(req.query.studentId)));
});

/** GET /api/allocations/pending  approved students waiting for a bed */
router.get('/pending', authorize('allocations.manage'), async (req, res) => {
  const where = new Where().add("a.status IN ('approved','fee_assigned')")
    .add("NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.student_id = s.id AND ra.status = 'active')");
  if (req.user.role !== 'super_admin') where.add('(a.preferred_hostel_id IN (?) OR a.preferred_hostel_id IS NULL)', req.user.hostelIds.length ? req.user.hostelIds : [0]);
  ok(res, await db.query(
    `SELECT a.id AS application_id, a.application_code, a.status, a.preferred_room_type, a.needs_ac, a.reviewed_at,
            s.id AS student_id, s.name, s.register_number, s.gender, s.year_of_study, d.short_name AS department, h.name AS preferred_hostel
       FROM hostel_applications a JOIN students s ON s.id = a.student_id JOIN departments d ON d.id = s.department_id
       LEFT JOIN hostels h ON h.id = a.preferred_hostel_id ${where.sql} ORDER BY a.reviewed_at`, where.params));
});

/** GET /api/allocations  active allocations (?hostelId&search&departmentId) */
router.get('/', authorize('allocations.manage', 'hostels.view'), async (req, res) => {
  const q = parseList(req.query, { sortable: { allocated: 'ra.allocated_at', student: 's.name', bed: 'b.bed_code' }, defaultSort: 'bed', defaultOrder: 'asc' });
  const where = new Where().add(`ra.status = ?`, q.status || 'active')
    .search(q.search, ['s.name', 's.register_number', 'b.bed_code', 'r.room_number'])
    .addIf(q.hostelId, 'ra.hostel_id = ?', q.hostelId)
    .addIf(q.departmentId, 's.department_id = ?', q.departmentId);
  scopeHostel(where, req.user, 'ra.hostel_id');
  paged(res, await paginate(db, {
    select: `ra.id, ra.status, ra.allocated_at, ra.ended_at, ra.end_reason, ra.academic_year, s.id AS student_id, s.name AS student_name, s.register_number,
             d.short_name AS department, s.year_of_study, b.bed_code, r.room_number, r.room_type, h.code AS hostel_code, h.name AS hostel_name, u.name AS allocated_by`,
    from: `FROM room_allocations ra JOIN students s ON s.id = ra.student_id JOIN departments d ON d.id = s.department_id
           JOIN beds b ON b.id = ra.bed_id JOIN rooms r ON r.id = ra.room_id JOIN hostels h ON h.id = ra.hostel_id LEFT JOIN users u ON u.id = ra.allocated_by`,
    where, ...q,
  }));
});

/** GET /api/allocations/history  all allocation records plus transfers (?studentId&hostelId&from&to) */
router.get('/history', authorize('allocations.manage', 'hostels.view'), async (req, res) => {
  const q = parseList(req.query, { sortable: { date: 'ra.allocated_at' }, defaultSort: 'date' });
  const where = new Where()
    .addIf(q.studentId, 'ra.student_id = ?', q.studentId)
    .addIf(q.hostelId, 'ra.hostel_id = ?', q.hostelId)
    .addIf(q.status, 'ra.status = ?', q.status)
    .addIf(q.from, 'ra.allocated_at >= ?', q.from)
    .addIf(q.to, 'ra.allocated_at < DATE_ADD(?, INTERVAL 1 DAY)', q.to)
    .search(q.search, ['s.name', 's.register_number', 'b.bed_code']);
  scopeHostel(where, req.user, 'ra.hostel_id');
  const result = await paginate(db, {
    select: `ra.id, ra.status, ra.allocated_at, ra.ended_at, ra.end_reason, s.id AS student_id, s.name AS student_name, s.register_number,
             b.bed_code, h.code AS hostel_code, u.name AS allocated_by`,
    from: `FROM room_allocations ra JOIN students s ON s.id = ra.student_id JOIN beds b ON b.id = ra.bed_id
           JOIN hostels h ON h.id = ra.hostel_id LEFT JOIN users u ON u.id = ra.allocated_by`,
    where, ...q,
  });
  const twhere = new Where().addIf(q.studentId, 't.student_id = ?', q.studentId);
  scopeHostel(twhere, req.user, 'ta.hostel_id');
  const transfers = await db.query(
    `SELECT t.id, t.created_at, t.reason, s.name AS student_name, s.register_number, fb.bed_code AS from_bed, tb.bed_code AS to_bed, u.name AS transferred_by
       FROM room_transfer_history t JOIN students s ON s.id = t.student_id JOIN beds fb ON fb.id = t.from_bed_id JOIN beds tb ON tb.id = t.to_bed_id
       JOIN room_allocations ta ON ta.id = t.to_allocation_id LEFT JOIN users u ON u.id = t.transferred_by
       ${twhere.sql} ORDER BY t.created_at DESC LIMIT 100`, twhere.params);
  ok(res, { allocations: result.data, transfers }, result.meta);
});

/** POST /api/allocations/:id/transfer  { newBedId, reason } */
router.post('/:id/transfer', authorize('allocations.manage'),
  validate(z.object({ newBedId: id, reason: z.string().trim().min(5, 'Please give a reason for the transfer').max(255) })),
  async (req, res) => created(res, await svc.transfer(req, Number(req.params.id), req.body)));

/** POST /api/allocations/:id/vacate  { reason }  direct release (use /api/exits for the full clearance workflow) */
router.post('/:id/vacate', authorize('allocations.manage'),
  validate(z.object({ reason: z.string().trim().min(5).max(255) })),
  async (req, res) => {
    const out = await db.transaction(async (conn) => {
      const v = await svc.vacate(req, Number(req.params.id), req.body.reason, conn);
      await notify(v.userId, { type: 'room_vacated', title: 'Bed released', message: `Your bed ${v.bedCode} has been released: ${req.body.reason}`, link: '/my/hostel' }, conn);
      return v;
    });
    ok(res, { id: out.id, bedCode: out.bedCode });
  });

module.exports = router;
