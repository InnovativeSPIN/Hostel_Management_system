const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { forbidden, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { isStudent, isAdmin } = require('../../utils/scope');
const { recordPayment } = require('./fees.service');

router.use(authenticate);

/**
 * POST /api/payments
 * { studentFeeId, amount, paymentMode, transactionId, paidAt?, remarks? }
 * Errors: OVERPAYMENT (422), DUPLICATE_TRANSACTION (409), FEE_ALREADY_PAID (409)
 */
router.post('/', authorize('payments.record'),
  validate(z.object({
    studentFeeId: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive('Amount must be greater than zero').max(10_000_000).multipleOf(0.01),
    paymentMode: z.enum(['cash', 'upi', 'card', 'netbanking', 'dd', 'cheque']),
    transactionId: z.string().trim().min(4).max(60).regex(/^[A-Za-z0-9\-/_]+$/, 'Transaction ID may contain letters, digits, - / _'),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/).optional(),
    remarks: z.string().trim().max(255).optional(),
  })),
  async (req, res) => {
    const b = req.body;
    if (b.paidAt && new Date(b.paidAt.replace(' ', 'T')) > new Date()) throw badRequest('Payment date cannot be in the future', 'INVALID_DATE');
    const out = await recordPayment(req, b, (conn, { paymentId, fee, balance, newBalance }) => audit(req, {
      action: 'PAYMENT_RECORDED', module: 'fees', recordId: paymentId,
      summary: `₹${b.amount} (${b.paymentMode}, ${b.transactionId}) from ${fee.register_number} - ${fee.student_name}`,
      oldValue: { balance }, newValue: { ...b, balance: newBalance },
    }, conn));
    created(res, out);
  });

/** GET /api/payments  payment register (collection report). Filters: search, mode, from/to */
router.get('/', authorize('fees.view_all'), async (req, res) => {
  const q = parseList(req.query, { sortable: { date: 'p.paid_at', amount: 'p.amount' }, defaultSort: 'date' });
  const where = new Where()
    .search(q.search, ['s.name', 's.register_number', 'p.transaction_id', 'p.receipt_number'])
    .addIf(q.mode, 'p.payment_mode = ?', q.mode)
    .addIf(q.from, 'p.paid_at >= ?', q.from)
    .addIf(q.to, 'p.paid_at < DATE_ADD(?, INTERVAL 1 DAY)', q.to);
  if (!isAdmin(req.user)) where.add('(ra.hostel_id IN (?) OR ra.id IS NULL)', req.user.hostelIds.length ? req.user.hostelIds : [0]);
  paged(res, await paginate(db, {
    select: `p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, s.id AS student_id, s.name AS student_name,
             s.register_number, fs.name AS fee_name, u.name AS recorded_by`,
    from: `FROM payments p JOIN students s ON s.id = p.student_id JOIN student_fees sf ON sf.id = p.student_fee_id
           JOIN fee_structures fs ON fs.id = sf.fee_structure_id LEFT JOIN users u ON u.id = p.recorded_by
           LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'`,
    where, ...q,
  }));
});

/** GET /api/payments/:studentId */
router.get('/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (isStudent(req.user) ? req.user.studentId !== studentId : !req.user.permissions.has('fees.view_all')) throw forbidden();
  ok(res, await db.query(
    `SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.transaction_id, p.paid_at, p.remarks, fs.name AS fee_name
       FROM payments p JOIN student_fees sf ON sf.id = p.student_fee_id JOIN fee_structures fs ON fs.id = sf.fee_structure_id
      WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [studentId]));
});

module.exports = router;
