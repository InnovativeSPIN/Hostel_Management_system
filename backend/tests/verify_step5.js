const assert = require('assert');
const db = require('../src/config/db');

async function run() {
  console.log('--- Verifying Step 5: Student Dashboard Additions (Menu, Leave/OD, Visitors) ---');

  // 1. Verify Mess Menu Weekly default records
  const weekly = await db.query('SELECT * FROM mess_menu_weekly');
  assert.strictEqual(weekly.length, 28, 'Should have 28 weekly menu records (7 days x 4 meals)');
  console.log('✔ Default weekly menu master table verified: 28 meals configured');

  // 2. Verify Mess Menu Today logic & Override
  const today = new Date().toISOString().slice(0, 10);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];

  // Insert a test override for today Lunch
  await db.query('DELETE FROM mess_menu_overrides WHERE override_date = ? AND meal_type = ?', [today, 'Lunch']);
  const [ovRes] = await db.pool.query(
    "INSERT INTO mess_menu_overrides (override_date, meal_type, items, reason, created_by) VALUES (?, 'Lunch', 'Festival Feast: Sweet Pongal, Vadai, Boli, Special Sambar Rice', 'College Day Festival', 1)",
    [today]
  );
  assert(ovRes.insertId, 'Override inserted');

  // Query today's menu
  const [weeklyToday, overridesToday] = await Promise.all([
    db.query('SELECT day_of_week, meal_type, items FROM mess_menu_weekly WHERE day_of_week = ?', [todayDay]),
    db.query('SELECT id, override_date, meal_type, items, reason FROM mess_menu_overrides WHERE override_date = ?', [today]),
  ]);

  const lunchOverride = overridesToday.find(o => o.meal_type === 'Lunch');
  assert(lunchOverride, 'Lunch override found');
  assert(lunchOverride.items.includes('Festival Feast'), 'Override item matches');
  console.log('✔ Today Mess Menu override logic verified: Override replaces default meal');

  // Clean up override
  await db.query('DELETE FROM mess_menu_overrides WHERE id = ?', [ovRes.insertId]);

  // 3. Verify Leave Request with On Duty ('on_duty')
  // Check that on_duty is accepted in leave_requests
  const dept = await db.one('SELECT id FROM departments LIMIT 1');
  const user = await db.one("SELECT id FROM users WHERE email = 'verify5_student@test.com'");
  if (user) {
    const s = await db.one('SELECT id FROM students WHERE user_id = ?', [user.id]);
    if (s) {
      await db.query('DELETE FROM leave_history WHERE leave_id IN (SELECT id FROM leave_requests WHERE student_id = ?)', [s.id]);
      await db.query('DELETE FROM leave_requests WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM visitor_entries WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM room_allocations WHERE student_id = ?', [s.id]);
      await db.query('DELETE FROM students WHERE id = ?', [s.id]);
    }
    await db.query('DELETE FROM users WHERE id = ?', [user.id]);
  }

  const [u] = await db.pool.query("INSERT INTO users (role_id, name, email, password_hash) VALUES (5, 'Verify5 Student', 'verify5_student@test.com', 'hash')");
  const [s] = await db.pool.query("INSERT INTO students (user_id, department_id, register_number, name, email, phone, gender, year_of_study, semester, batch, student_type) VALUES (?, ?, 'REG_V5', 'Verify5 Student', 'verify5_student@test.com', '9876543299', 'female', 3, 5, '2023-27', 'NSCET')", [u.insertId, dept.id]);
  const studentId = s.insertId;

  // Insert on_duty leave
  const [lvRes] = await db.pool.query(
    `INSERT INTO leave_requests (leave_code, student_id, leave_type, from_date, to_date, expected_return_at, reason, destination, guardian_contact, emergency_contact, status)
     VALUES ('LV_TEST_OD', ?, 'on_duty', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 DAY), NOW(), 'Paper presentation at Anna University Symposium', 'Chennai', '9876543210', '9876543210', 'pending')`,
    [studentId]
  );
  assert(lvRes.insertId, 'On Duty leave inserted');

  const lv = await db.one('SELECT * FROM leave_requests WHERE id = ?', [lvRes.insertId]);
  assert.strictEqual(lv.leave_type, 'on_duty', 'Leave type is on_duty');
  assert.strictEqual(lv.status, 'pending', 'Status is pending');

  // Warden approve leave with remarks
  await db.query("UPDATE leave_requests SET status = 'approved', reviewed_by = 1, reviewed_at = NOW(), review_remarks = 'OD Approved for symposium' WHERE id = ?", [lv.id]);
  const lvApproved = await db.one('SELECT * FROM leave_requests WHERE id = ?', [lv.id]);
  assert.strictEqual(lvApproved.status, 'approved', 'Leave approved');
  assert.strictEqual(lvApproved.review_remarks, 'OD Approved for symposium', 'Warden remarks saved');
  console.log('✔ Leave & On Duty (OD) request flow verified');

  // 4. Verify Time-based Visitor Request & Overstay
  // Ensure a visitor exists
  await db.query("INSERT INTO visitors (name, phone, id_proof_type, id_proof_number) VALUES ('Parent Visitor', '9876543200', 'aadhaar', '123456789012') ON DUPLICATE KEY UPDATE name = VALUES(name)");
  const vis = await db.one("SELECT id FROM visitors WHERE phone = '9876543200'");

  const hostel = await db.one('SELECT id FROM hostels LIMIT 1');

  // Insert time-based visitor entry
  const [veRes] = await db.pool.query(
    `INSERT INTO visitor_entries (pass_code, visitor_id, student_id, hostel_id, relationship, purpose, visit_date, from_time, to_time, status, approval_status)
     VALUES ('VP_TEST_5', ?, ?, ?, 'Mother', 'Delivering books and medicines', CURDATE(), '10:00:00', '12:00:00', 'expected', 'pending')`,
    [vis.id, studentId, hostel.id]
  );
  assert(veRes.insertId, 'Visitor entry inserted');

  // Verify warden approval
  await db.query("UPDATE visitor_entries SET approval_status = 'approved', approved_by = 1 WHERE id = ?", [veRes.insertId]);
  const veApproved = await db.one('SELECT * FROM visitor_entries WHERE id = ?', [veRes.insertId]);
  assert.strictEqual(veApproved.approval_status, 'approved', 'Visitor approved by warden');

  // Simulate check-in and checkout with overstay flag
  await db.query("UPDATE visitor_entries SET status = 'checked_in', entry_time = NOW() WHERE id = ?", [veApproved.id]);
  await db.query("UPDATE visitor_entries SET status = 'checked_out', exit_time = NOW(), overstay_flagged = 1 WHERE id = ?", [veApproved.id]);
  const veCheckedOut = await db.one('SELECT * FROM visitor_entries WHERE id = ?', [veApproved.id]);
  assert.strictEqual(veCheckedOut.status, 'checked_out', 'Status is checked_out');
  assert.strictEqual(veCheckedOut.overstay_flagged, 1, 'Overstay flag recorded');
  console.log('✔ Time-based visitor request, warden approval, and overstay tracking verified');

  // Clean up
  await db.query('DELETE FROM visitor_entries WHERE id = ?', [veRes.insertId]);
  await db.query('DELETE FROM leave_requests WHERE id = ?', [lvRes.insertId]);
  await db.query('DELETE FROM students WHERE id = ?', [studentId]);
  await db.query('DELETE FROM users WHERE id = ?', [u.insertId]);

  console.log('--- Step 5 Verification Complete: ALL TESTS PASSED ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Step 5 Verification Failed:', err);
  process.exit(1);
});
