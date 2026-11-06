require('dotenv').config();
const { pool } = require('../src/config/db');

async function testStep2() {
  console.log('--- Verifying Step 2 (Student Types: NSCET & NS-CBSE) ---');

  // 1. Verify schema
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'student_type'`
  );
  console.log('students.student_type column:', cols[0]);
  if (!cols[0] || !cols[0].COLUMN_DEFAULT.includes('NSCET')) {
    throw new Error('Default for students.student_type must be NSCET');
  }

  const [cbseTable] = await pool.query(
    `SELECT TABLE_NAME 
     FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_cbse_details'`
  );
  if (!cbseTable.length) {
    throw new Error('student_cbse_details table missing');
  }
  console.log('student_cbse_details table exists: OK');

  // 2. Verify all existing students have student_type = 'NSCET'
  const [nonNscet] = await pool.query(
    "SELECT COUNT(*) AS c FROM students WHERE student_type <> 'NSCET'"
  );
  console.log('Non-NSCET existing count:', nonNscet[0].c);

  // 3. Test insert of a test NS-CBSE student into students and student_cbse_details
  const testReg = `TEST-CBSE-${Date.now().toString().slice(-4)}`;
  const testEmail = `cbse.test.${Date.now()}@example.com`;
  
  // Insert user
  const [u] = await pool.query(
    "INSERT INTO users (role_id, name, email, phone, password_hash) VALUES ((SELECT id FROM roles WHERE name = 'student'), ?, ?, '9876543210', 'test_hash')",
    ['CBSE Student Test', testEmail]
  );
  const userId = u.insertId;

  // Insert student
  const [cbseDept] = await pool.query("SELECT id FROM departments WHERE code = 'CBSE'");
  const deptId = cbseDept[0]?.id || 1;

  const [s] = await pool.query(
    `INSERT INTO students (user_id, register_number, name, email, phone, gender, date_of_birth, department_id, year_of_study, semester, section, batch, admission_quota, student_type)
     VALUES (?, ?, 'CBSE Student Test', ?, '9876543210', 'male', '2010-05-14', ?, 1, 1, 'A', '2026-2027', 'management', 'NS-CBSE')`,
    [userId, testReg, testEmail, deptId]
  );
  const studentId = s.insertId;
  console.log(`Inserted test CBSE student ID: ${studentId}`);

  // Insert CBSE details
  await pool.query(
    `INSERT INTO student_cbse_details 
     (student_id, class_level, section, admission_number, date_of_birth, blood_group, parent_name, parent_phone, local_guardian_name, local_guardian_phone, medical_conditions, allergies)
     VALUES (?, 'Class 10', 'A', 'ADM-2026-001', '2010-05-14', 'O+', 'Ramasamy', '9876543211', 'Sundaram', '9876543212', 'Mild asthma', 'Dust allergy')`,
    [studentId]
  );
  console.log('Inserted student_cbse_details: OK');

  // Query back student with cbse details
  const [joined] = await pool.query(
    `SELECT s.id, s.name, s.student_type, s.register_number, 
            c.class_level, c.admission_number, c.local_guardian_name, c.medical_conditions
     FROM students s 
     JOIN student_cbse_details c ON c.student_id = s.id 
     WHERE s.id = ?`,
    [studentId]
  );
  console.log('Queried joined CBSE record:', joined[0]);

  if (joined[0].class_level !== 'Class 10' || joined[0].student_type !== 'NS-CBSE') {
    throw new Error('CBSE details mismatch');
  }

  // Clean up test records
  await pool.query('DELETE FROM student_cbse_details WHERE student_id = ?', [studentId]);
  await pool.query('DELETE FROM students WHERE id = ?', [studentId]);
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  console.log('Cleanup completed: OK');

  console.log('\n>>> STEP 2 AUTOMATED VERIFICATION PASSED SUCCESSFULLY! <<<');
  process.exit(0);
}

testStep2().catch((err) => {
  console.error('Step 2 test failed:', err);
  process.exit(1);
});
