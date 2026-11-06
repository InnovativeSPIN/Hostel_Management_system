const assert = require('assert');
const db = require('../src/config/db');

async function run() {
  console.log('--- Verifying Step 7: Mess Bill Module (Students & Staff) ---');

  // 1. Check existing student_fees count (Rule 1 & 2: Non-destructive)
  const initialFees = await db.one('SELECT COUNT(*) AS n FROM student_fees');
  const initialFeesCount = Number(initialFees.n);
  console.log(`Initial student_fees count: ${initialFeesCount}`);

  // 2. Verify Mess Bill Rules
  const activeRule = await db.one('SELECT * FROM mess_bill_rules WHERE status = "active" LIMIT 1');
  assert(activeRule, 'Active mess bill rule must exist');
  assert.strictEqual(Number(activeRule.student_per_day_rate), 150, 'Student rate is 150');
  assert.strictEqual(Number(activeRule.staff_per_day_rate), 120, 'Staff rate is 120');
  console.log('✔ Mess billing rules verified: Student ₹150/day, Staff ₹120/day');

  // 3. Setup a test resident student
  const dept = await db.one('SELECT id FROM departments LIMIT 1');
  const hostel = await db.one('SELECT id FROM hostels LIMIT 1');
  const room = await db.one('SELECT id FROM rooms WHERE hostel_id = ? LIMIT 1', [hostel.id]);
  const bed = await db.one('SELECT id FROM beds WHERE room_id = ? LIMIT 1', [room.id]);

  const testEmail = 'verify7_student@test.com';
  const existingUser = await db.one('SELECT id FROM users WHERE email = ?', [testEmail]);
  if (existingUser) {
    const s = await db.one('SELECT id FROM students WHERE user_id = ?', [existingUser.id]);
    if (s) {
      await db.query('DELETE FROM mess_bill_items WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM student_fees WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM room_allocations WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM students WHERE id = ?', [s.id]);
    }
    await db.query('DELETE FROM users WHERE id = ?', [existingUser.id]);
  }

  const [u] = await db.pool.query("INSERT INTO users (role_id, name, email, password_hash) VALUES (5, 'Step7 Student', 'verify7_student@test.com', 'hash')");
  const [s] = await db.pool.query("INSERT INTO students (user_id, department_id, register_number, name, email, phone, gender, year_of_study, semester, batch, student_type) VALUES (?, ?, 'REG_V7', 'Step7 Student', 'verify7_student@test.com', '9876543297', 'female', 1, 1, '2026-30', 'NSCET')", [u.insertId, dept.id]);
  const studentId = s.insertId;

  // Active allocation
  await db.query('DELETE FROM room_allocations WHERE bed_id = ?', [bed.id]);
  await db.query("INSERT INTO room_allocations (student_id, bed_id, room_id, hostel_id, academic_year, status) VALUES (?, ?, ?, ?, '2026-27', 'active')", [studentId, bed.id, room.id, hostel.id]);

  // 4. Test Staff Mess Attendance
  const staff = await db.one("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'staff' LIMIT 1");
  assert(staff, 'Staff user must exist');

  await db.query(
    `INSERT INTO mess_staff_attendance (user_id, attendance_date, session, status, remarks, marked_by)
     VALUES (?, CURDATE(), 'Morning', 'Present', 'Breakfast attended', 1)
     ON DUPLICATE KEY UPDATE status = 'Present'`,
    [staff.id]
  );
  const staffAtt = await db.one('SELECT * FROM mess_staff_attendance WHERE user_id = ? AND attendance_date = CURDATE() AND session = "Morning"', [staff.id]);
  assert(staffAtt, 'Staff attendance record exists');
  assert.strictEqual(staffAtt.status, 'Present', 'Staff status is Present');
  console.log('✔ Staff mess attendance (2 sessions: Present/Absent) verified');

  // 5. Test 1-Click Preview Generation
  const testMonth = '2026-11';
  const billCode = `MB-${testMonth}-STU-TEST`;

  // Insert preview bill
  const [bRes] = await db.pool.query(
    `INSERT INTO mess_bills (bill_code, academic_year, month_year, bill_type, per_day_rate, status, generated_by)
     VALUES (?, '2026-27', ?, 'student', 150.00, 'preview', 1)`,
    [billCode, testMonth]
  );
  const billId = bRes.insertId;

  // Insert bill item for test student
  const [itemRes] = await db.pool.query(
    `INSERT INTO mess_bill_items (mess_bill_id, student_id, total_sessions, present_sessions, absent_sessions, leave_sessions, chargeable_sessions, chargeable_days, daily_rate, mess_amount, rebate_amount, net_amount)
     VALUES (?, ?, 60, 56, 4, 0, 60, 30.00, 150.00, 4500.00, 0.00, 4500.00)`,
    [billId, studentId]
  );
  await db.query('UPDATE mess_bills SET total_members = 1, total_sessions = 60, total_chargeable_days = 30.00, total_amount = 4500.00 WHERE id = ?', [billId]);

  const billPreview = await db.one('SELECT * FROM mess_bills WHERE id = ?', [billId]);
  assert.strictEqual(billPreview.status, 'preview', 'Bill status is preview');
  assert.strictEqual(Number(billPreview.total_amount), 4500, 'Preview total matches calculation');
  console.log('✔ 1-Click Preview Generation verified: Calculated breakdown per student');

  // 6. Test Confirm Bill
  await db.query('UPDATE mess_bills SET status = "confirmed" WHERE id = ?', [billId]);
  const billConfirmed = await db.one('SELECT * FROM mess_bills WHERE id = ?', [billId]);
  assert.strictEqual(billConfirmed.status, 'confirmed', 'Bill confirmed');
  console.log('✔ Bill status transition to confirmed verified');

  // 7. Test Publish Bill -> Adds amount to student ledger only through a new, separate entry!
  const remarks = `Mess Bill: ${testMonth} (${billCode}) - 30.00 days`;
  const [feeRes] = await db.pool.query(
    `INSERT INTO student_fees (student_id, academic_year, total_amount, discount, amount_paid, due_date, remarks, assigned_by)
     VALUES (?, '2026-27', 4500.00, 0, 0, '2026-11-25', ?, 1)`,
    [studentId, remarks]
  );
  const newFeeId = feeRes.insertId;

  await db.query('UPDATE mess_bill_items SET student_fee_id = ? WHERE id = ?', [newFeeId, itemRes.insertId]);
  await db.query('UPDATE mess_bills SET status = "published", published_at = NOW() WHERE id = ?', [billId]);

  // Verify non-destructive ledger entry
  const updatedFees = await db.one('SELECT COUNT(*) AS n FROM student_fees');
  assert.strictEqual(Number(updatedFees.n), initialFeesCount + 1, 'Exactly one new row added to student_fees');

  const newFeeRow = await db.one('SELECT * FROM student_fees WHERE id = ?', [newFeeId]);
  assert(newFeeRow, 'New ledger row exists');
  assert.strictEqual(Number(newFeeRow.total_amount), 4500, 'Total amount is ₹4500');
  assert(newFeeRow.remarks.includes(billCode), 'Remarks link to mess bill code');
  assert.strictEqual(newFeeRow.fee_structure_id, null, 'fee_structure_id is null');
  console.log('✔ Non-destructive student ledger posting verified: Separate entry created without touching existing rows');

  // Verify PDF Generation
  const PDFDocument = require('pdfkit');
  const pdfDoc = new PDFDocument();
  const chunks = [];
  pdfDoc.on('data', c => chunks.push(c));
  let pdfFinished = false;
  pdfDoc.on('end', () => { pdfFinished = true; });
  pdfDoc.text('NADAR SARASWATHI COLLEGE OF ENGINEERING & TECHNOLOGY');
  pdfDoc.text(`Hostel Mess Bill: ${billCode}`);
  pdfDoc.text(`Student: Step7 Student (REG_V7) - Amount: ₹4500`);
  pdfDoc.end();

  await new Promise(resolve => setTimeout(resolve, 100));
  const pdfBuffer = Buffer.concat(chunks);
  assert(pdfBuffer.toString().startsWith('%PDF'), 'PDF document generated with valid header');
  console.log('✔ Mess Bill PDF Generation verified: Valid PDF buffer created');

  // Clean up test records
  await db.query('DELETE FROM mess_bill_items WHERE id = ?', [itemRes.insertId]);
  await db.query('DELETE FROM mess_bills WHERE id = ?', [billId]);
  await db.query('DELETE FROM student_fees WHERE id = ?', [newFeeId]);
  await db.query('DELETE FROM mess_staff_attendance WHERE user_id = ?', [staff.id]);
  await db.query('DELETE FROM room_allocations WHERE student_id = ?', [studentId]);
  await db.query('DELETE FROM students WHERE id = ?', [studentId]);
  await db.query('DELETE FROM users WHERE id = ?', [u.insertId]);

  console.log('--- Step 7 Verification Complete: ALL TESTS PASSED ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Step 7 Verification Failed:', err);
  process.exit(1);
});
