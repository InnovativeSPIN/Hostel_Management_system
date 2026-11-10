const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../../helpers');

describe('API: Fees, Payments & Immutability Ledger', () => {
  let c;
  let testStudent;
  let feeStructure;
  let studentFee;

  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    c = client();
    await c.login(USERS.admin[0], USERS.admin[1]);
  });

  describe('Fee Structures & Student Assignment', () => {
    it('GET /api/fees/structures returns fee structures list', async () => {
      const res = await c.as(USERS.admin[0]).get('/api/fees/structures');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
    });

    it('POST /api/fees/structures creates a new fee structure template', async () => {
      const payload = {
        name: 'Annual Hostel & Mess Fee 2026-27',
        academicYear: '2026-27',
        roomType: 'double',
        hostelFee: 30000,
        messFee: 25000,
        maintenanceFee: 5000,
        securityDeposit: 5000,
        otherFee: 1000,
        dueDate: '2026-12-31',
      };
      const res = await c.as(USERS.admin[0]).post('/api/fees/structures', payload);
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id);
      feeStructure = { id: res.body.data.id, total: 66000 };
    });

    it('POST /api/fees assigns fee to student and creates student_fee record', async () => {
      testStudent = await db.one(`
        SELECT s.id, s.name, s.register_number FROM students s
        WHERE NOT EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND sf.fee_structure_id = ?)
        LIMIT 1
      `, [feeStructure.id]);
      assert.ok(testStudent, 'Must find candidate student');

      const res = await c.as(USERS.admin[0]).post('/api/fees', {
        feeStructureId: feeStructure.id,
        studentIds: [testStudent.id],
        discount: 2000,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.assigned, 1);

      studentFee = await db.one('SELECT * FROM student_fees WHERE student_id = ? AND fee_structure_id = ?', [testStudent.id, feeStructure.id]);
      assert.ok(studentFee);
      assert.equal(Number(studentFee.discount), 2000);
      assert.equal(Number(studentFee.total_amount), 66000);
      assert.equal(Number(studentFee.amount_paid), 0);
    });

    it('POST /api/fees skips duplicate fee assignment cleanly', async () => {
      const res = await c.as(USERS.admin[0]).post('/api/fees', {
        feeStructureId: feeStructure.id,
        studentIds: [testStudent.id],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.assigned, 0);
      assert.equal(res.body.data.skipped, 1);
    });
  });

  describe('Payments Processing & Edge Cases', () => {
    it('POST /api/payments records partial payment and updates remaining balance', async () => {
      assert.ok(studentFee, 'studentFee must be defined');
      const res = await c.as(USERS.admin[0]).post('/api/payments', {
        studentFeeId: studentFee.id,
        amount: 20000,
        paymentMode: 'upi',
        transactionId: 'UPI-TEST-10001',
        remarks: 'First installment payment',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.receiptNumber);
      assert.equal(Number(res.body.data.balance), 44000); // 66000 - 2000 discount - 20000 = 44000

      const updated = await db.one('SELECT amount_paid FROM student_fees WHERE id = ?', [studentFee.id]);
      assert.equal(Number(updated.amount_paid), 20000);
    });

    it('POST /api/payments rejects overpayment exceeding the remaining balance with 422 OVERPAYMENT', async () => {
      const res = await c.as(USERS.admin[0]).post('/api/payments', {
        studentFeeId: studentFee.id,
        amount: 50000, // Remaining balance is 44000
        paymentMode: 'netbanking',
        transactionId: 'NET-OVERPAY-99',
      });
      assert.equal(res.status, 422);
      assert.equal(res.body.code, 'OVERPAYMENT');
    });

    it('POST /api/payments rejects duplicate transaction ID with 409 DUPLICATE_TRANSACTION', async () => {
      const res = await c.as(USERS.admin[0]).post('/api/payments', {
        studentFeeId: studentFee.id,
        amount: 10000,
        paymentMode: 'upi',
        transactionId: 'UPI-TEST-10001', // Already used in partial payment test
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'DUPLICATE_TRANSACTION');
    });

    it('POST /api/payments completing exact balance transitions fee to paid', async () => {
      const res = await c.as(USERS.admin[0]).post('/api/payments', {
        studentFeeId: studentFee.id,
        amount: 44000, // exact remaining balance
        paymentMode: 'netbanking',
        transactionId: 'NET-FULL-PAY-01',
        remarks: 'Final settlement payment',
      });
      assert.equal(res.status, 201);
      assert.equal(Number(res.body.data.balance), 0);
    });
  });

  describe('Ledger Immutability & Financial Integrity', () => {
    it('prohibits direct UPDATE on payments table via MySQL trigger trg_payments_no_update', async () => {
      const payment = await db.one('SELECT id FROM payments LIMIT 1');
      assert.ok(payment, 'Must find existing payment record');

      await assert.rejects(
        db.query('UPDATE payments SET amount = amount + 500 WHERE id = ?', [payment.id]),
        /immutable/i,
        'Database trigger must reject payment modification'
      );
    });

    it('GET /api/fees/alerts provides active risk alerts summary', async () => {
      const res = await c.as(USERS.admin[0]).get('/api/fees/alerts');
      assert.equal(res.status, 200);
      assert.ok('overdue' in res.body.data);
      assert.ok('dueSoon' in res.body.data);
      assert.ok('partial' in res.body.data);
      assert.ok('repeatDefaulters' in res.body.data);
    });
  });
});
