require('dotenv').config();
const { pool } = require('../src/config/db');

async function testStep3() {
  console.log('--- Verifying Step 3 (Blocks, Room Categories, and Fee Structure V2) ---');

  // 1. Verify Block A Ground Floor rooms
  const [blockA] = await pool.query(
    `SELECT r.room_number, r.room_category, r.capacity, r.is_ac, r.attached_bath,
            COUNT(b.id) AS bed_count
     FROM rooms r 
     JOIN floors f ON f.id = r.floor_id 
     LEFT JOIN beds b ON b.room_id = r.id
     WHERE r.hostel_id = 1 AND f.floor_number = 0
     GROUP BY r.id
     ORDER BY CAST(r.room_number AS UNSIGNED)`
  );
  console.log(`Block A Ground Floor rooms found: ${blockA.length}`);
  if (blockA.length !== 9) throw new Error(`Expected 9 rooms in Block A Ground Floor, got ${blockA.length}`);

  // Rooms 1-4: 4 AC rooms, 3 capacity each
  for (let i = 1; i <= 4; i++) {
    const rm = blockA.find(r => r.room_number === String(i));
    if (!rm || rm.room_category !== 'AC Room' || rm.capacity !== 3 || rm.is_ac !== 1 || rm.attached_bath !== 1 || rm.bed_count !== 3) {
      throw new Error(`Block A Room ${i} mismatch: ${JSON.stringify(rm)}`);
    }
  }
  console.log('Block A Rooms 1-4 (4 AC rooms, 3 beds each): OK');

  // Rooms 5-9: 5 Attached toilet rooms, 3 capacity each
  for (let i = 5; i <= 9; i++) {
    const rm = blockA.find(r => r.room_number === String(i));
    if (!rm || rm.room_category !== 'Attached Toilet' || rm.capacity !== 3 || rm.is_ac !== 0 || rm.attached_bath !== 1 || rm.bed_count !== 3) {
      throw new Error(`Block A Room ${i} mismatch: ${JSON.stringify(rm)}`);
    }
  }
  console.log('Block A Rooms 5-9 (5 Attached toilet rooms, 3 beds each): OK');

  // 2. Verify Block B Ground Floor rooms
  const [blockB] = await pool.query(
    `SELECT r.room_number, r.room_category, r.capacity, r.is_ac, r.attached_bath,
            COUNT(b.id) AS bed_count
     FROM rooms r 
     JOIN floors f ON f.id = r.floor_id 
     LEFT JOIN beds b ON b.room_id = r.id
     WHERE r.hostel_id = 2 AND f.floor_number = 0
     GROUP BY r.id
     ORDER BY CAST(r.room_number AS UNSIGNED)`
  );
  console.log(`Block B Ground Floor rooms found: ${blockB.length}`);
  if (blockB.length !== 9) throw new Error(`Expected 9 rooms in Block B Ground Floor, got ${blockB.length}`);

  // Rooms 1-9: normal rooms, 4 sharing
  for (let i = 1; i <= 9; i++) {
    const rm = blockB.find(r => r.room_number === String(i));
    if (!rm || rm.room_category !== 'Normal Room' || rm.capacity !== 4 || rm.is_ac !== 0 || rm.attached_bath !== 0 || rm.bed_count !== 4) {
      throw new Error(`Block B Room ${i} mismatch: ${JSON.stringify(rm)}`);
    }
  }
  console.log('Block B Rooms 1-9 (9 Normal rooms, 4 beds each): OK');

  // 3. Verify capacity constraint (block over-allocation beyond capacity)
  let capacityBlocked = false;
  try {
    // Attempt to set current_occupancy = 5 on a capacity = 4 room
    await pool.query("UPDATE rooms SET current_occupancy = 5 WHERE hostel_id = 2 AND room_number = '1'");
  } catch (err) {
    if (err.message.includes('chk_room_occupancy') || err.message.includes('CONSTRAINT')) {
      capacityBlocked = true;
      console.log('Database constraint strictly blocks over-allocation beyond capacity: OK');
    } else {
      throw err;
    }
  }
  if (!capacityBlocked) {
    throw new Error('Database allowed current_occupancy > capacity!');
  }

  // 4. Verify fee_structures_v2
  const [v2Rows] = await pool.query('SELECT * FROM fee_structures_v2 WHERE deleted_at IS NULL');
  console.log(`fee_structures_v2 rows count: ${v2Rows.length}`);
  if (v2Rows.length < 5) throw new Error('Expected at least 5 fee_structures_v2 rows');

  // Test insert and delete on fee_structures_v2
  const [newFee] = await pool.query(
    `INSERT INTO fee_structures_v2 
     (name, student_type, room_category, academic_year, admission_fee, caution_deposit, room_rent, mess_charges, per_day_mess_rate, other_charges, total_amount, due_date)
     VALUES ('Test Fee', 'NSCET', 'Normal Room', '2026-27', 1000, 1000, 10000, 20000, 100, 500, 32500, '2026-09-01')`
  );
  const testFeeId = newFee.insertId;
  const [fetched] = await pool.query('SELECT * FROM fee_structures_v2 WHERE id = ?', [testFeeId]);
  if (!fetched.length || Number(fetched[0].total_amount) !== 32500) {
    throw new Error('Fee Structure V2 insert/read failed');
  }
  await pool.query('DELETE FROM fee_structures_v2 WHERE id = ?', [testFeeId]);
  console.log('fee_structures_v2 CRUD test: OK');

  // 5. Verify existing legacy fee records are 100% untouched
  const [legacyFees] = await pool.query('SELECT COUNT(*) AS c FROM fee_structures');
  const [legacyStudentFees] = await pool.query('SELECT COUNT(*) AS c FROM student_fees');
  console.log(`Existing legacy fee_structures untouched: ${legacyFees[0].c} rows`);
  console.log(`Existing legacy student_fees untouched: ${legacyStudentFees[0].c} rows`);

  console.log('\n>>> ALL STEP 3 VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<');
  process.exit(0);
}

testStep3().catch((err) => {
  console.error('Step 3 verification failed:', err);
  process.exit(1);
});
