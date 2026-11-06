const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/tests/verify_step9.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldFeeInsert = `    // Record caution deposit fee
    await db.pool.query(
      \`INSERT INTO student_fees (student_id, fee_type, title, academic_year, total_amount, amount_paid, due_date)
       VALUES (?, 'caution_deposit', 'Caution Deposit', '2026-27', 5000.00, 5000.00, CURDATE())\`,
      [studentId]
    );`;

const newFeeInsert = `    // Record fee structure for caution deposit
    await db.pool.query(
      \`INSERT INTO student_fees (student_id, fee_structure_v2_id, academic_year, total_amount, amount_paid, due_date)
       VALUES (?, 1, '2026-27', 67000.00, 67000.00, CURDATE())\`,
      [studentId]
    );`;

code = code.replace(oldFeeInsert, newFeeInsert);
fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Fixed student_fees insert in verify_step9.js');
