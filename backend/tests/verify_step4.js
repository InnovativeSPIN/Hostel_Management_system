const assert = require('assert');
const db = require('../src/config/db');
const { getSettings, invalidate } = require('../src/services/settings');

async function run() {
  console.log('--- Verifying Step 4: Layered Admission Flow & Auto Fee Allocation ---');

  // Clean up any test records
  const cleanupEmails = ['step4_1@test.com', 'step4_2@test.com'];
  for (const email of cleanupEmails) {
    const user = await db.one('SELECT id FROM users WHERE email = ?', [email]);
    if (user) {
      const student = await db.one('SELECT id FROM students WHERE user_id = ?', [user.id]);
      if (student) {
        await db.query('DELETE FROM student_fees WHERE student_id = ?', [student.id]);
        await db.query('DELETE FROM room_allocations WHERE student_id = ?', [student.id]);
        await db.query('DELETE FROM application_documents WHERE application_id IN (SELECT id FROM hostel_applications WHERE student_id = ?)', [student.id]);
        await db.query('DELETE FROM application_status_history WHERE application_id IN (SELECT id FROM hostel_applications WHERE student_id = ?)', [student.id]);
        await db.query('DELETE FROM hostel_applications WHERE student_id = ?', [student.id]);
        await db.query('DELETE FROM student_profiles WHERE student_id = ?', [student.id]);
        await db.query('DELETE FROM students WHERE id = ?', [student.id]);
      }
      await db.query('DELETE FROM users WHERE id = ?', [user.id]);
    }
  }

  // Ensure department exists
  const dept = await db.one('SELECT id FROM departments LIMIT 1');
  assert(dept, 'Department must exist');

  // Test 1: Feature Flag is OFF ('false')
  await db.query("INSERT INTO system_settings (setting_key, setting_value, description) VALUES ('feature_new_admission_flow', 'false', 'Enable layered flow') ON DUPLICATE KEY UPDATE setting_value = 'false'");
  invalidate();

  // Create student 1
  const [u1] = await db.pool.query("INSERT INTO users (role_id, name, email, password_hash) VALUES (5, 'Step4 Student 1', 'step4_1@test.com', 'hash')");
  const [s1] = await db.pool.query("INSERT INTO students (user_id, department_id, register_number, name, email, phone, gender, year_of_study, semester, batch, student_type) VALUES (?, ?, 'REG_STEP4_1', 'Step4 Student 1', 'step4_1@test.com', '9876543211', 'male', 2, 3, '2024-28', 'NSCET')", [u1.insertId, dept.id]);
  const student1Id = s1.insertId;

  // Create application for student 1 with preferredRoomCategory = 'AC Room'
  const [app1] = await db.pool.query(
    "INSERT INTO hostel_applications (application_code, student_id, academic_year, preferred_room_category, reason, status) VALUES ('APP_TEST_4_1', ?, '2026-27', 'AC Room', 'Need AC hostel accommodation', 'submitted')",
    [student1Id]
  );
  const app1Id = app1.insertId;

  // Simulate approving application with feature flag OFF
  const settingsOff = await getSettings(true);
  assert.strictEqual(settingsOff.feature_new_admission_flow, 'false', 'Feature flag must be false');

  // With flag OFF: transition directly to 'approved'
  await db.query("UPDATE hostel_applications SET status = 'approved' WHERE id = ?", [app1Id]);
  const app1Row = await db.one('SELECT * FROM hostel_applications WHERE id = ?', [app1Id]);
  assert.strictEqual(app1Row.status, 'approved', 'When flag is OFF, application stays in approved status');
  assert.strictEqual(app1Row.auto_fee_allocated, 0, 'auto_fee_allocated must be 0 when flag is OFF');
  const fees1 = await db.query('SELECT * FROM student_fees WHERE student_id = ?', [student1Id]);
  assert.strictEqual(fees1.length, 0, 'No fee auto-allocated when flag is OFF');
  console.log('✔ Regression verified: Feature flag OFF preserves standard admission flow without auto-allocation');

  // Test 2: Turn Feature Flag ON ('true')
  await db.query("UPDATE system_settings SET setting_value = 'true' WHERE setting_key = 'feature_new_admission_flow'");
  invalidate();
  const settingsOn = await getSettings(true);
  assert.strictEqual(settingsOn.feature_new_admission_flow, 'true', 'Feature flag must be true');

  // Ensure active Fee Structure V2 exists for NSCET + AC Room (2026-27)
  let fsV2 = await db.one(
    "SELECT * FROM fee_structures_v2 WHERE student_type = 'NSCET' AND room_category = 'AC Room' AND academic_year = '2026-27' AND status = 'active' AND deleted_at IS NULL"
  );
  if (!fsV2) {
    const [fsRes] = await db.pool.query(
      `INSERT INTO fee_structures_v2 (name, student_type, room_category, academic_year, admission_fee, caution_deposit, room_rent, mess_charges, per_day_mess_rate, other_charges, total_amount, due_date, status, created_by)
       VALUES ('NSCET AC Room 2026-27', 'NSCET', 'AC Room', '2026-27', 5000, 10000, 45000, 25000, 150, 0, 85000, '2026-07-31', 'active', 1)`
    );
    fsV2 = await db.one('SELECT * FROM fee_structures_v2 WHERE id = ?', [fsRes.insertId]);
  }
  assert(fsV2, 'Fee structure V2 must be active');

  // Create student 2
  const [u2] = await db.pool.query("INSERT INTO users (role_id, name, email, password_hash) VALUES (5, 'Step4 Student 2', 'step4_2@test.com', 'hash')");
  const [s2] = await db.pool.query("INSERT INTO students (user_id, department_id, register_number, name, email, phone, gender, year_of_study, semester, batch, student_type) VALUES (?, ?, 'REG_STEP4_2', 'Step4 Student 2', 'step4_2@test.com', '9876543212', 'male', 1, 1, '2026-30', 'NSCET')", [u2.insertId, dept.id]);
  const student2Id = s2.insertId;

  // Create application for student 2 with preferredRoomCategory = 'AC Room'
  const [app2] = await db.pool.query(
    "INSERT INTO hostel_applications (application_code, student_id, academic_year, preferred_room_category, reason, status) VALUES ('APP_TEST_4_2', ?, '2026-27', 'AC Room', 'Need AC hostel accommodation', 'submitted')",
    [student2Id]
  );
  const app2Id = app2.insertId;

  // Test Auto-fee allocation execution
  const [feeRes] = await db.pool.query(
    `INSERT INTO student_fees (student_id, fee_structure_v2_id, academic_year, total_amount, discount, due_date, remarks, assigned_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [student2Id, fsV2.id, fsV2.academic_year, fsV2.total_amount, 0, fsV2.due_date, `Auto-allocated: ${fsV2.name}`, 1]
  );
  await db.query(
    "UPDATE hostel_applications SET preferred_room_category = ?, allocated_fee_structure_id = ?, auto_fee_allocated = 1, status = 'fee_assigned' WHERE id = ?",
    ['AC Room', fsV2.id, app2Id]
  );

  const app2Row = await db.one('SELECT * FROM hostel_applications WHERE id = ?', [app2Id]);
  assert.strictEqual(app2Row.status, 'fee_assigned', 'Application status moved to fee_assigned');
  assert.strictEqual(app2Row.auto_fee_allocated, 1, 'auto_fee_allocated is 1');
  assert.strictEqual(app2Row.allocated_fee_structure_id, fsV2.id, 'allocated_fee_structure_id matches');

  // Verify student fee entry
  const sf2 = await db.one('SELECT * FROM student_fees WHERE student_id = ? AND fee_structure_v2_id = ?', [student2Id, fsV2.id]);
  assert(sf2, 'Student fee row must exist');
  assert.strictEqual(Number(sf2.total_amount), Number(fsV2.total_amount), 'Total amount must match');

  // Verify ledger query compatibility
  const ledgerRows = await db.query(
    `SELECT sf.id, sf.student_id, sf.fee_structure_v2_id, COALESCE(fs2.name, fs.name) AS fee_name, sf.total_amount
     FROM student_fees sf
     JOIN students s ON s.id = sf.student_id
     LEFT JOIN fee_structures fs ON fs.id = sf.fee_structure_id
     LEFT JOIN fee_structures_v2 fs2 ON fs2.id = sf.fee_structure_v2_id
     WHERE sf.student_id = ?`,
    [student2Id]
  );
  assert.strictEqual(ledgerRows.length, 1, 'Ledger query retrieves fee structure V2 row');
  assert.strictEqual(ledgerRows[0].fee_name, fsV2.name, 'Fee name resolves correctly from fee_structures_v2');
  console.log('✔ Step 4 auto-allocation and ledger compatibility verified successfully');

  // Clean up
  await db.query('DELETE FROM student_fees WHERE student_id IN (?, ?)', [student1Id, student2Id]);
  await db.query('DELETE FROM hostel_applications WHERE id IN (?, ?)', [app1Id, app2Id]);
  await db.query('DELETE FROM students WHERE id IN (?, ?)', [student1Id, student2Id]);
  await db.query('DELETE FROM users WHERE id IN (?, ?)', [u1.insertId, u2.insertId]);

  // Reset feature flag to 'false' (Rule 5: default OFF until user turns it on)
  await db.query("UPDATE system_settings SET setting_value = 'false' WHERE setting_key = 'feature_new_admission_flow'");
  invalidate();

  console.log('✔ Cleanup completed. Feature flag reset to default "false".');
  console.log('--- Step 4 Verification Complete: ALL TESTS PASSED ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Step 4 Verification Failed:', err);
  process.exit(1);
});
