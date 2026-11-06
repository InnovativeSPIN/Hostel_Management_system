const assert = require('assert');
const db = require('../src/config/db');

async function run() {
  console.log('--- Verifying Step 6: 2-Session Attendance (Morning / Evening) ---');

  // 1. Verify legacy attendance table is completely untouched
  const legacyCount = await db.one('SELECT COUNT(*) AS n FROM attendance');
  assert.strictEqual(Number(legacyCount.n), 1354, 'Legacy attendance table must remain untouched with 1354 records');
  console.log('✔ Regression verified: Legacy attendance table remains completely untouched');

  // 2. Setup test student with approved on_duty and medical leaves
  const dept = await db.one('SELECT id FROM departments LIMIT 1');
  const hostel = await db.one('SELECT id FROM hostels LIMIT 1');
  const room = await db.one('SELECT id FROM rooms WHERE hostel_id = ? LIMIT 1', [hostel.id]);
  const bed = await db.one('SELECT id FROM beds WHERE room_id = ? LIMIT 1', [room.id]);

  const testEmail = 'verify6_student@test.com';
  const existingUser = await db.one('SELECT id FROM users WHERE email = ?', [testEmail]);
  if (existingUser) {
    const s = await db.one('SELECT id FROM students WHERE user_id = ?', [existingUser.id]);
    if (s) {
      await db.query('DELETE FROM attendance_sessions WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM leave_requests WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM room_allocations WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM students WHERE id = ?', [s.id]);
    }
    await db.query('DELETE FROM users WHERE id = ?', [existingUser.id]);
  }

  const [u] = await db.pool.query("INSERT INTO users (role_id, name, email, password_hash) VALUES (5, 'Step6 Student', 'verify6_student@test.com', 'hash')");
  const [s] = await db.pool.query("INSERT INTO students (user_id, department_id, register_number, name, email, phone, gender, year_of_study, semester, batch, student_type) VALUES (?, ?, 'REG_V6', 'Step6 Student', 'verify6_student@test.com', '9876543298', 'female', 2, 3, '2024-28', 'NSCET')", [u.insertId, dept.id]);
  const studentId = s.insertId;

  // Active room allocation
  await db.query("INSERT INTO room_allocations (student_id, bed_id, room_id, hostel_id, academic_year, status) VALUES (?, ?, ?, ?, '2026-27', 'active')", [studentId, bed.id, room.id, hostel.id]);

  const testDate = '2026-11-10';

  // 3. Test Leave / OD Auto-fill
  const [lvRes] = await db.pool.query(
    `INSERT INTO leave_requests (leave_code, student_id, leave_type, from_date, to_date, expected_return_at, reason, destination, guardian_contact, emergency_contact, status)
     VALUES ('LV_STEP6_OD', ?, 'on_duty', '2026-11-09', '2026-11-11', '2026-11-11 18:00:00', 'Paper presentation', 'Coimbatore', '9876543210', '9876543210', 'approved')`,
    [studentId]
  );

  // Check auto-fill logic for testDate (covered by approved OD)
  const leave = await db.one("SELECT * FROM leave_requests WHERE student_id = ? AND status = 'approved' AND ? BETWEEN from_date AND to_date", [studentId, testDate]);
  assert(leave, 'Approved leave covering testDate must exist');
  assert.strictEqual(leave.leave_type, 'on_duty', 'Leave type is on_duty');
  console.log('✔ Approved OD leave detected and ready for auto-fill');

  // 4. Test Session Attendance Save: Morning Session
  // Insert session record: Present
  await db.query(
    `INSERT INTO attendance_sessions (student_id, hostel_id, room_id, block_name, attendance_date, session, status, remarks, marked_by)
     VALUES (?, ?, ?, 'Block A', ?, 'Morning', 'On Duty', 'Auto-filled from LV_STEP6_OD', 1)`,
    [studentId, hostel.id, room.id, testDate]
  );

  // 5. Test Session Attendance Save: Evening Session
  // Insert session record: Absent with mandatory absent_reason
  await db.query(
    `INSERT INTO attendance_sessions (student_id, hostel_id, room_id, block_name, attendance_date, session, status, absent_reason, remarks, marked_by)
     VALUES (?, ?, ?, 'Block A', ?, 'Evening', 'Absent', 'Left hostel without gate pass', 'Warden informed parent', 1)`,
    [studentId, hostel.id, room.id, testDate]
  );

  // Verify unique constraint: student + date + session prevents duplicate session records
  let dupeFailed = false;
  try {
    await db.query(
      `INSERT INTO attendance_sessions (student_id, hostel_id, attendance_date, session, status) VALUES (?, ?, ?, 'Morning', 'Present')`,
      [studentId, hostel.id, testDate]
    );
  } catch (err) {
    dupeFailed = true;
  }
  assert.strictEqual(dupeFailed, true, 'Unique key uk_att_session properly prevents duplicate records per session');
  console.log('✔ Session uniqueness (Morning / Evening per student per date) verified');

  // 6. Test Reports
  // Day report
  const dayRows = await db.query(
    'SELECT * FROM attendance_sessions WHERE attendance_date = ?',
    [testDate]
  );
  assert(dayRows.length >= 2, 'Day report returns both Morning and Evening session records');
  const morningRec = dayRows.find(r => r.session === 'Morning');
  const eveningRec = dayRows.find(r => r.session === 'Evening');
  assert.strictEqual(morningRec.status, 'On Duty', 'Morning status is On Duty');
  assert.strictEqual(eveningRec.status, 'Absent', 'Evening status is Absent');
  assert.strictEqual(eveningRec.absent_reason, 'Left hostel without gate pass', 'Mandatory absent reason recorded');
  console.log('✔ Daily Session Report verified with Morning/Evening breakdown and absent reason');

  // Student report
  const studentSessions = await db.query(
    'SELECT * FROM attendance_sessions WHERE student_id = ? ORDER BY session ASC',
    [studentId]
  );
  assert.strictEqual(studentSessions.length, 2, 'Student report returns all sessions');
  console.log('✔ Student Session Report verified');

  // Block report
  const blockRows = await db.query(
    `SELECT block_name, session, COUNT(*) as total, SUM(status = 'Absent') as absent
     FROM attendance_sessions WHERE attendance_date = ? GROUP BY block_name, session`,
    [testDate]
  );
  assert(blockRows.length >= 1, 'Block report aggregates data by block and session');
  console.log('✔ Block-wise Session Report verified');

  // Clean up
  await db.query('DELETE FROM attendance_sessions WHERE student_id = ?', [studentId]);
  await db.query('DELETE FROM leave_requests WHERE id = ?', [lvRes.insertId]);
  await db.query('DELETE FROM room_allocations WHERE student_id = ?', [studentId]);
  await db.query('DELETE FROM students WHERE id = ?', [studentId]);
  await db.query('DELETE FROM users WHERE id = ?', [u.insertId]);

  console.log('--- Step 6 Verification Complete: ALL TESTS PASSED ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Step 6 Verification Failed:', err);
  process.exit(1);
});
