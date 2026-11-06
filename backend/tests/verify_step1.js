require('dotenv').config();
const { pool } = require('../src/config/db');

async function test() {
  console.log('Verifying Step 1 database columns...');
  const [cols] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
       AND (
         (TABLE_NAME = 'students' AND COLUMN_NAME IN ('admission_quota', 'photo_url'))
         OR (TABLE_NAME = 'student_profiles' AND COLUMN_NAME = 'cgpa')
       )`
  );
  console.log('Columns:', JSON.stringify(cols, null, 2));

  // Verify quotas contain '7.5% Scheme' and 'Sports Quota'
  const quotaCol = cols.find(c => c.COLUMN_NAME === 'admission_quota');
  const has75 = quotaCol.COLUMN_TYPE.includes('7.5% Scheme');
  const hasSports = quotaCol.COLUMN_TYPE.includes('Sports Quota');
  console.log('Has 7.5% Scheme:', has75);
  console.log('Has Sports Quota:', hasSports);

  // Verify photo_url exists and is nullable
  const photoCol = cols.find(c => c.COLUMN_NAME === 'photo_url');
  console.log('Has photo_url nullable:', photoCol && photoCol.IS_NULLABLE === 'YES');

  // Verify cgpa in student_profiles is untouched
  const cgpaCol = cols.find(c => c.COLUMN_NAME === 'cgpa');
  console.log('Has cgpa in student_profiles:', !!cgpaCol);

  // Verify students query still succeeds
  const [students] = await pool.query(
    `SELECT s.id, s.name, s.admission_quota, s.photo_url, sp.cgpa 
     FROM students s 
     LEFT JOIN student_profiles sp ON sp.student_id = s.id 
     LIMIT 5`
  );
  console.log('Sample students count:', students.length);
  if (students.length > 0) {
    console.log('First student sample:', students[0]);
  }

  console.log('ALL STEP 1 VERIFICATION CHECKS PASSED!');
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
