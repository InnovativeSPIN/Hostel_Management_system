const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, cleanup, db } = require('../helpers');

describe('Database: Relational Integrity, Constraints & Immutability Triggers', () => {
  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await cleanup();
  });

  describe('Foreign Key Integrity & Cascades', () => {
    it('prevents deleting a hostel that has active rooms and beds', async () => {
      const hostel = await db.one("SELECT id FROM hostels WHERE code = 'A'");
      assert.ok(hostel);

      // Attempting to delete hostel should fail with ER_ROW_IS_REFERENCED_2
      await assert.rejects(
        db.query('DELETE FROM hostels WHERE id = ?', [hostel.id]),
        (err) => err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451
      );
    });

    it('prevents deleting a room that has active allocations', async () => {
      const occupiedRoom = await db.one('SELECT id FROM rooms WHERE current_occupancy > 0 LIMIT 1');
      assert.ok(occupiedRoom);

      await assert.rejects(
        db.query('DELETE FROM rooms WHERE id = ?', [occupiedRoom.id]),
        (err) => err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451
      );
    });
  });

  describe('Database CHECK Constraints', () => {
    it('enforces chk_activity_time constraint when end_at <= start_at', async () => {
      const invalidActivity = `
        INSERT INTO activities (title, category, venue, start_at, end_at, max_participants)
        VALUES ('Bad Time Event', 'sports', 'Main Ground', '2026-11-20 18:00:00', '2026-11-20 17:00:00', 50)
      `;
      await assert.rejects(
        db.query(invalidActivity),
        (err) => err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.errno === 3819
      );
    });
  });

  describe('Unique Indexes & Deduplication', () => {
    it('enforces unique active allocation per bed (uq_alloc_active_bed)', async () => {
      const alloc = await db.one("SELECT student_id, hostel_id, room_id, bed_id, academic_year FROM room_allocations WHERE status = 'active' LIMIT 1");
      assert.ok(alloc);

      // Find another unallocated student
      const otherStudent = await db.one(`
        SELECT id FROM students WHERE id != ? AND NOT EXISTS (SELECT 1 FROM room_allocations WHERE student_id = students.id AND status = 'active') LIMIT 1
      `, [alloc.student_id]);
      assert.ok(otherStudent);

      // Attempting direct raw insert of a second active allocation for the same bed
      const dupeSql = `
        INSERT INTO room_allocations (student_id, hostel_id, room_id, bed_id, academic_year, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `;
      await assert.rejects(
        db.query(dupeSql, [otherStudent.id, alloc.hostel_id, alloc.room_id, alloc.bed_id, alloc.academic_year]),
        (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062
      );
    });

    it('enforces unique daily attendance per student (uq_attendance)', async () => {
      const att = await db.one('SELECT student_id, hostel_id, attendance_date FROM attendance LIMIT 1');
      assert.ok(att);

      const dupeAttendance = `
        INSERT INTO attendance (student_id, hostel_id, attendance_date, status)
        VALUES (?, ?, ?, 'present')
      `;
      await assert.rejects(
        db.query(dupeAttendance, [att.student_id, att.hostel_id, att.attendance_date]),
        (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062
      );
    });

    it('enforces unique transaction ID in payments table', async () => {
      const payment = await db.one('SELECT student_fee_id, student_id, receipt_number, transaction_id, amount FROM payments LIMIT 1');
      assert.ok(payment);

      const dupePayment = `
        INSERT INTO payments (receipt_number, student_fee_id, student_id, amount, payment_mode, transaction_id, paid_at)
        VALUES ('RCP-FAKE-999', ?, ?, ?, 'upi', ?, NOW())
      `;
      await assert.rejects(
        db.query(dupePayment, [payment.student_fee_id, payment.student_id, payment.amount, payment.transaction_id]),
        (err) => err.code === 'ER_DUP_ENTRY' || err.errno === 1062
      );
    });
  });

  describe('Database Triggers & Ledger Immutability', () => {
    it('trg_payments_no_update blocks all UPDATE statements on payments table', async () => {
      const payment = await db.one('SELECT id FROM payments LIMIT 1');
      assert.ok(payment);

      await assert.rejects(
        db.query('UPDATE payments SET remarks = "Tampered ledger entry" WHERE id = ?', [payment.id]),
        /Payments are immutable/i
      );
    });

    it('trg_audit_logs_no_update blocks UPDATE statements on audit_logs table', async () => {
      const log = await db.one('SELECT id FROM audit_logs LIMIT 1');
      if (log) {
        await assert.rejects(
          db.query('UPDATE audit_logs SET summary = "Tampered audit" WHERE id = ?', [log.id]),
          /Audit logs are read-only and immutable/i
        );
      }
    });

    it('trg_audit_logs_no_delete blocks DELETE statements on audit_logs table', async () => {
      const log = await db.one('SELECT id FROM audit_logs LIMIT 1');
      if (log) {
        await assert.rejects(
          db.query('DELETE FROM audit_logs WHERE id = ?', [log.id]),
          /Audit logs are read-only and immutable/i
        );
      }
    });
  });
});
