const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, badRequest, conflict, forbidden } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify } = require('../../services/notify');
const { isAdmin, isStudent } = require('../../utils/scope');
const { getNumber } = require('../../services/settings');
const { FEE_STATUS_SQL } = require('./fees.service');

router.use(authenticate);

const money = z.coerce.number().min(0).max(10_000_000);
const structureBody = z.object({
  name: z.string().trim().min(3).max(120),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Academic year must look like 2026-27'),
  hostelId: z.coerce.number().int().positive().optional().nullable(),
  roomType: z.enum(['single', 'double', 'triple', 'quad', 'dormitory']).optional().nullable(),
  studentType: z.enum(['nscet', 'ns_cbse']).default('nscet'),
  hostelFee: money, messFee: money, maintenanceFee: money, securityDeposit: money, otherFee: money.default(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const LEDGER_FROM = `FROM student_fees sf
  JOIN students s ON s.id = sf.student_id
  JOIN departments d ON d.id = s.department_id
  JOIN fee_structures fs ON fs.id = sf.fee_structure_id
  LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
  LEFT JOIN hostels h ON h.id = ra.hostel_id
  LEFT JOIN rooms r ON r.id = ra.room_id`;

function scopeFees(where, user) {
  if (isStudent(user)) return where.add('sf.student_id = ?', user.studentId || 0);
  if (!isAdmin(user)) where.add('(ra.hostel_id IN (?) OR ra.id IS NULL)', user.hostelIds.length ? user.hostelIds : [0]);
  return where;
}

/** GET /api/fees/structures */
router.get('/structures', authorize('fees.view_all', 'fees.manage'), async (_req, res) => {
  ok(res, await db.query(
    `SELECT fs.*, h.name AS hostel_name, COUNT(sf.id) AS assigned_count, COALESCE(SUM(sf.amount_paid),0) AS collected
       FROM fee_structures fs LEFT JOIN hostels h ON h.id = fs.hostel_id LEFT JOIN student_fees sf ON sf.fee_structure_id = fs.id
      GROUP BY fs.id ORDER BY fs.academic_year DESC, fs.name`));
});

/** POST /api/fees/structures */
router.post('/structures', authorize('fees.manage'), validate(structureBody), async (req, res) => {
  const b = req.body;
  const [r] = await db.pool.query(
    `INSERT INTO fee_structures (name, academic_year, hostel_id, room_type, student_type, hostel_fee, mess_fee, maintenance_fee, security_deposit, other_fee, due_date, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.name, b.academicYear, b.hostelId || null, b.roomType || null, b.studentType, b.hostelFee, b.messFee, b.maintenanceFee, b.securityDeposit, b.otherFee, b.dueDate, req.user.id]);
  await audit(req, { action: 'FEE_STRUCTURE_CREATED', module: 'fees', recordId: r.insertId, summary: `Created fee structure ${b.name} (${b.academicYear} · ${b.studentType})`, newValue: b });
  created(res, { id: r.insertId });
});

/** PUT /api/fees/structures/:id  amounts are locked once the structure has been assigned */
router.put('/structures/:id', authorize('fees.manage'), validate(structureBody.extend({ status: z.enum(['active', 'archived']).default('active') })), async (req, res) => {
  const before = await db.one('SELECT * FROM fee_structures WHERE id = ?', [req.params.id]);
  if (!before) throw notFound('Fee structure');
  const b = req.body;
  const assigned = (await db.one('SELECT COUNT(*) AS n FROM student_fees WHERE fee_structure_id = ?', [before.id])).n;
  const amountsChanged = ['hostel_fee:hostelFee', 'mess_fee:messFee', 'maintenance_fee:maintenanceFee', 'security_deposit:securityDeposit', 'other_fee:otherFee']
    .some((pair) => { const [col, key] = pair.split(':'); return Number(before[col]) !== Number(b[key]); });
  if (assigned && amountsChanged) throw conflict('Amounts cannot change after the structure is assigned to students. Create a new structure instead.', 'FEE_STRUCTURE_LOCKED');
  await db.query(
    `UPDATE fee_structures SET name=?, academic_year=?, hostel_id=?, room_type=?, student_type=?, hostel_fee=?, mess_fee=?, maintenance_fee=?, security_deposit=?, other_fee=?, due_date=?, status=? WHERE id=?`,
    [b.name, b.academicYear, b.hostelId || null, b.roomType || null, b.studentType || before.student_type, b.hostelFee, b.messFee, b.maintenanceFee, b.securityDeposit, b.otherFee, b.dueDate, b.status, before.id]);
  await audit(req, { action: 'FEE_STRUCTURE_UPDATED', module: 'fees', recordId: before.id, summary: `Updated fee structure ${b.name}`, oldValue: before, newValue: b });
  ok(res, { id: before.id });
});

/**
 * GET /api/fees  fee ledger rows.
 * Filters: search (student), departmentId, hostelId, status (paid|partial|pending|overdue|waived), academicYear, from/to (due date)
 */
router.get('/', async (req, res) => {
  if (!isStudent(req.user) && !req.user.permissions.has('fees.view_all')) throw forbidden();
  const q = parseList(req.query, {
    sortable: { due: 'sf.due_date', student: 's.name', balance: '(sf.total_amount - sf.discount - sf.amount_paid)', paid: 'sf.amount_paid' },
    defaultSort: 'due',
    defaultOrder: 'asc',
  });
  const where = new Where()
    .search(q.search, ['s.name', 's.register_number'])
    .addIf(q.departmentId, 's.department_id = ?', q.departmentId)
    .addIf(q.hostelId, 'ra.hostel_id = ?', q.hostelId)
    .addIf(q.academicYear, 'sf.academic_year = ?', q.academicYear)
    .addIf(q.status, `${FEE_STATUS_SQL} = ?`, q.status)
    .addIf(q.from, 'sf.due_date >= ?', q.from)
    .addIf(q.to, 'sf.due_date <= ?', q.to);
  scopeFees(where, req.user);
  const result = await paginate(db, {
    select: `sf.id, sf.student_id, s.name AS student_name, s.register_number, d.short_name AS department, s.year_of_study,
             h.code AS hostel_code, r.room_number, fs.name AS fee_name, sf.academic_year, sf.total_amount, sf.discount, sf.amount_paid,
             (sf.total_amount - sf.discount - sf.amount_paid) AS balance, sf.due_date, sf.waived, ${FEE_STATUS_SQL} AS status,
             GREATEST(DATEDIFF(CURDATE(), sf.due_date), 0) AS days_overdue`,
    from: LEDGER_FROM, where, ...q,
  });
  const totals = await db.one(
    `SELECT COALESCE(SUM(sf.total_amount - sf.discount),0) AS billed, COALESCE(SUM(sf.amount_paid),0) AS collected,
            COALESCE(SUM(IF(sf.waived = 0, sf.total_amount - sf.discount - sf.amount_paid, 0)),0) AS outstanding,
            COALESCE(SUM(IF(${FEE_STATUS_SQL} = 'overdue', sf.total_amount - sf.discount - sf.amount_paid, 0)),0) AS overdue_amount
       ${LEDGER_FROM} ${where.sql}`, where.params);
  ok(res, result.data, { ...result.meta, totals });
});

/** GET /api/fees/alerts  Fee Risk Alert: overdue, due this week, partial, repeat defaulters */
router.get('/alerts', authorize('fees.view_all'), async (req, res) => {
  const soonDays = await getNumber('fee_due_soon_days');
  const where = new Where().add('sf.waived = 0').add('sf.amount_paid < sf.total_amount - sf.discount');
  scopeFees(where, req.user);
  const rows = await db.query(
    `SELECT sf.id, sf.student_id, s.name AS student_name, s.register_number, d.short_name AS department, h.code AS hostel_code, r.room_number,
            fs.name AS fee_name, sf.due_date, (sf.total_amount - sf.discount - sf.amount_paid) AS balance, sf.amount_paid,
            ${FEE_STATUS_SQL} AS status, DATEDIFF(sf.due_date, CURDATE()) AS days_to_due
       ${LEDGER_FROM} ${where.sql} ORDER BY sf.due_date`, where.params);
  // Repeat defaulters: students with two or more fee records that went past due unpaid.
  const repeatWhere = scopeFees(new Where().add('sf.waived = 0').add('sf.due_date < CURDATE()')
    .add('(sf.amount_paid < sf.total_amount - sf.discount OR EXISTS (SELECT 1 FROM payments p WHERE p.student_fee_id = sf.id AND p.paid_at > sf.due_date))'), req.user);
  const repeat = await db.query(
    `SELECT s.id AS student_id, s.name AS student_name, s.register_number, COUNT(*) AS overdue_records
       FROM student_fees sf JOIN students s ON s.id = sf.student_id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
      ${repeatWhere.sql} GROUP BY s.id HAVING COUNT(*) >= 2`, repeatWhere.params);
  ok(res, {
    overdue: rows.filter((r) => r.status === 'overdue'),
    dueSoon: rows.filter((r) => r.status !== 'overdue' && r.days_to_due <= soonDays),
    partial: rows.filter((r) => r.status === 'partial'),
    repeatDefaulters: repeat,
    dueSoonDays: soonDays,
  });
});

/**
 * POST /api/fees  assign a fee structure to students.
 * { feeStructureId, studentIds?: number[], allResidents?: boolean, discount?, dueDate? }
 */
router.post('/', authorize('fees.manage'),
  validate(z.object({
    feeStructureId: z.coerce.number().int().positive(),
    studentIds: z.array(z.coerce.number().int().positive()).max(2000).optional(),
    allResidents: z.coerce.boolean().default(false),
    discount: money.default(0),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    remarks: z.string().trim().max(255).optional(),
  }).refine((b) => b.allResidents || (b.studentIds && b.studentIds.length), 'Select students or choose all residents')),
  async (req, res) => {
    const b = req.body;
    const fs = await db.one("SELECT * FROM fee_structures WHERE id = ? AND status = 'active'", [b.feeStructureId]);
    if (!fs) throw notFound('Active fee structure');
    if (b.discount > fs.total_amount) throw badRequest('Discount cannot exceed the fee total', 'INVALID_DISCOUNT');

    let students;
    if (b.allResidents) {
      students = await db.query(
        `SELECT s.id, s.user_id FROM students s JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
           JOIN rooms r ON r.id = ra.room_id
          WHERE (? IS NULL OR ra.hostel_id = ?) AND (? IS NULL OR r.room_type = ?)`,
        [fs.hostel_id, fs.hostel_id, fs.room_type, fs.room_type]);
    } else {
      students = await db.query('SELECT id, user_id FROM students WHERE id IN (?) AND deleted_at IS NULL', [b.studentIds]);
      if (students.length !== new Set(b.studentIds).size) throw badRequest('One or more students do not exist', 'INVALID_STUDENT');
    }
    const result = await db.transaction(async (conn) => {
      let assigned = 0;
      const assignedUsers = [];
      for (const s of students) {
        const [r] = await conn.query(
          `INSERT IGNORE INTO student_fees (student_id, fee_structure_id, academic_year, total_amount, discount, due_date, remarks, assigned_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [s.id, fs.id, fs.academic_year, fs.total_amount, b.discount, b.dueDate || fs.due_date, b.remarks || null, req.user.id]);
        if (r.affectedRows) { assigned += 1; assignedUsers.push(s.user_id); }
      }
      // Move matching applications forward in the admission workflow.
      if (assigned) {
        const ids = students.map((s) => s.id);
        const apps = await db.query(
          "SELECT id, status FROM hostel_applications WHERE student_id IN (?) AND status = 'approved' AND academic_year = ?", [ids, fs.academic_year], conn);
        for (const a of apps) {
          await conn.query("UPDATE hostel_applications SET status = 'fee_assigned' WHERE id = ?", [a.id]);
          await conn.query("INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks) VALUES (?,?,?,?,?)",
            [a.id, a.status, 'fee_assigned', req.user.id, `Fee ${fs.name} assigned`]);
        }
      }
      await notify(assignedUsers, {
        type: 'fee_assigned', title: 'Hostel fee assigned',
        message: `${fs.name} (₹${Number(fs.total_amount - b.discount).toLocaleString('en-IN')}) is due by ${b.dueDate || fs.due_date}.`, link: '/my/fees',
      }, conn);
      await audit(req, { action: 'FEE_ASSIGNED', module: 'fees', recordId: fs.id, summary: `Assigned ${fs.name} to ${assigned} student(s)`, newValue: { ...b, assigned } }, conn);
      return { assigned, skipped: students.length - assigned };
    });
    ok(res, result);
  });

/** POST /api/fees/:id/adjust  { discount?, waived?, dueDate?, remarks }  (admin) */
router.post('/:id/adjust', authorize('fees.manage'),
  validate(z.object({ discount: money.optional(), waived: z.boolean().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), remarks: z.string().trim().min(3).max(255) })),
  async (req, res) => {
    const before = await db.one('SELECT * FROM student_fees WHERE id = ?', [req.params.id]);
    if (!before) throw notFound('Student fee');
    const b = req.body;
    const discount = b.discount ?? before.discount;
    if (discount + before.amount_paid > before.total_amount) throw conflict('Discount plus amount already paid cannot exceed the fee total', 'INVALID_DISCOUNT');
    await db.query('UPDATE student_fees SET discount = ?, waived = ?, due_date = ?, remarks = ? WHERE id = ?',
      [discount, b.waived ?? before.waived, b.dueDate ?? before.due_date, b.remarks, before.id]);
    await audit(req, { action: 'FEE_ADJUSTED', module: 'fees', recordId: before.id, summary: b.remarks, oldValue: before, newValue: b });
    ok(res, { id: before.id });
  });

/** GET /api/fees/ledger/:studentId  full fee ledger with payment history */
router.get('/ledger/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isStudent(req.user) ? req.user.studentId !== studentId : !req.user.permissions.has('fees.view_all')) throw forbidden();
  const student = await db.one(
    `SELECT s.id, s.name, s.register_number, d.short_name AS department, s.year_of_study FROM students s
       JOIN departments d ON d.id = s.department_id WHERE s.id = ?`, [studentId]);
  if (!student) throw notFound('Student');
  const [fees, payments] = await Promise.all([
    db.query(
      `SELECT sf.*, fs.name AS fee_name, fs.hostel_fee, fs.mess_fee, fs.maintenance_fee, fs.security_deposit, fs.other_fee,
              (sf.total_amount - sf.discount - sf.amount_paid) AS balance, ${FEE_STATUS_SQL} AS status
         FROM student_fees sf JOIN fee_structures fs ON fs.id = sf.fee_structure_id WHERE sf.student_id = ? ORDER BY sf.due_date DESC`, [studentId]),
    db.query(
      `SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, p.remarks, fs.name AS fee_name, u.name AS recorded_by
         FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id
         LEFT JOIN users u ON u.id = p.recorded_by WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]),
  ]);
  const totals = fees.reduce((a, f) => ({ billed: a.billed + f.total_amount - f.discount, paid: a.paid + f.amount_paid, due: a.due + (f.waived ? 0 : f.balance) }), { billed: 0, paid: 0, due: 0 });
  ok(res, { student, fees, payments, totals });
});

module.exports = router;
