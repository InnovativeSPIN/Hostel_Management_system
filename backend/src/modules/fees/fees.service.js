const crypto = require('crypto');
const db = require('../../config/db');
const { conflict, notFound, unprocessable } = require('../../utils/AppError');
const { toDateTimeStr } = require('../../utils/helpers');
const { notify } = require('../../services/notify');

// Fee status is derived, never stored, so it can't go stale when a due date passes.
const FEE_STATUS_SQL = `(CASE
  WHEN sf.waived = 1 THEN 'waived'
  WHEN sf.amount_paid >= sf.total_amount - sf.discount THEN 'paid'
  WHEN sf.due_date < CURDATE() THEN 'overdue'
  WHEN sf.amount_paid > 0 THEN 'partial'
  ELSE 'pending' END)`;

/**
 * Records a payment against a student fee inside a transaction.
 * Locks the fee row so two simultaneous payments cannot overpay.
 */
async function recordPayment(req, { studentFeeId, amount, paymentMode, transactionId, paidAt, remarks }, auditFn) {
  return db.transaction(async (conn) => {
    const fee = await db.one(
      `SELECT sf.*, s.user_id, s.name AS student_name, s.register_number, ra.hostel_id
         FROM student_fees sf JOIN students s ON s.id = sf.student_id
         LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        WHERE sf.id = ? FOR UPDATE`, [studentFeeId], conn);
    if (!fee) throw notFound('Student fee');
    if (req.user.role !== 'super_admin' && fee.hostel_id && !req.user.hostelIds.includes(fee.hostel_id)) {
      throw unprocessable('This student belongs to a hostel outside your scope', 'OUT_OF_SCOPE');
    }
    if (fee.waived) throw conflict('This fee has been waived', 'FEE_WAIVED');
    const balance = Number((fee.total_amount - fee.discount - fee.amount_paid).toFixed(2));
    if (balance <= 0) throw conflict('This fee is already fully paid', 'FEE_ALREADY_PAID');
    if (amount > balance) throw unprocessable(`Payment of ₹${amount} exceeds the outstanding balance of ₹${balance}`, 'OVERPAYMENT');

    const dupe = await db.one('SELECT id FROM payments WHERE transaction_id = ?', [transactionId], conn);
    if (dupe) throw conflict('A payment with this transaction ID already exists', 'DUPLICATE_TRANSACTION');

    // Payments are immutable (DB trigger), so the receipt number must be final at insert time.
    const receipt = receiptNumber();
    const [p] = await conn.query(
      `INSERT INTO payments (receipt_number, student_fee_id, student_id, amount, payment_mode, transaction_id, paid_at, recorded_by, remarks)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [receipt, fee.id, fee.student_id, amount, paymentMode, transactionId, paidAt || toDateTimeStr(), req.user.id, remarks || null]);
    await conn.query('UPDATE student_fees SET amount_paid = amount_paid + ? WHERE id = ?', [amount, fee.id]);
    const newBalance = Number((balance - amount).toFixed(2));
    await notify(fee.user_id, {
      type: 'payment_received', title: 'Payment received',
      message: `₹${amount.toLocaleString('en-IN')} received (Txn ${transactionId}). Outstanding: ₹${newBalance.toLocaleString('en-IN')}.`,
      link: '/my/fees',
    }, conn);
    if (auditFn) await auditFn(conn, { paymentId: p.insertId, fee, balance, newBalance });
    return { id: p.insertId, receiptNumber: receipt, balance: newBalance };
  });
}

function receiptNumber(d = new Date()) {
  const ymd = toDateTimeStr(d).slice(0, 10).replace(/-/g, '');
  return `RCP${ymd}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

module.exports = { FEE_STATUS_SQL, recordPayment, receiptNumber };
