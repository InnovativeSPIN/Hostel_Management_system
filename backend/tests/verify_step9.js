const assert = require('assert');
const http = require('http');
const db = require('../src/config/db');
const app = require('../src/app');
const { signToken } = require('../src/middleware/auth');
const { toDateStr } = require('../src/utils/helpers');

// Minimal 1x1 PNG for damage proof test
const samplePng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

async function run() {
  console.log('--- Verifying Step 9: Exit / Vacate Workflow with Settlement Statement PDF ---');

  // 1. Check schema additions
  const exitTableCols = await db.query('DESCRIBE hostel_exit_records');
  const colNames = exitTableCols.map((c) => c.Field);
  assert(colNames.includes('warden_approved_by'), 'Must include warden_approved_by');
  assert(colNames.includes('warden_approved_at'), 'Must include warden_approved_at');
  assert(colNames.includes('damage_photo_url'), 'Must include damage_photo_url');
  assert(colNames.includes('inspection_checklist'), 'Must include inspection_checklist');
  assert(colNames.includes('settlement_id'), 'Must include settlement_id');

  const settlementTable = await db.one("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'exit_settlements'");
  assert.strictEqual(Number(settlementTable.n), 1, 'exit_settlements table must exist');
  console.log('✔ Schema verified: exit_settlements table and additive columns on hostel_exit_records present');

  // 2. Start server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // 3. Setup test users: warden and a resident student
    const wardenUser = await db.one("SELECT u.* FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'warden' LIMIT 1");
    assert(wardenUser, 'Warden user must exist');
    const wardenToken = signToken(wardenUser);

    // Setup a dedicated resident student with an active bed
    const dept = await db.one('SELECT id FROM departments LIMIT 1');
    const hostel = await db.one('SELECT id FROM hostels LIMIT 1');
    const room = await db.one('SELECT id FROM rooms WHERE hostel_id = ? AND status = "active" LIMIT 1', [hostel.id]);
    const bed = await db.one('SELECT id, bed_code FROM beds WHERE room_id = ? AND status = "available" LIMIT 1', [room.id]);
    assert(bed, 'Available bed must exist for testing');

    const testEmail = `step9_student_${Date.now()}@test.com`;
    const [uRes] = await db.pool.query("INSERT INTO users (role_id, name, email, password_hash) VALUES (5, 'Step9 Student', ?, 'hash')", [testEmail]);
    const [sRes] = await db.pool.query(
      `INSERT INTO students (user_id, department_id, register_number, name, email, phone, gender, year_of_study, semester, batch, student_type, hostel_status)
       VALUES (?, ?, ?, 'Step9 Student', ?, '9876543299', 'female', 4, 8, '2023-2027', 'NSCET', 'resident')`,
      [uRes.insertId, dept.id, `REG9_${Date.now()}`.slice(0, 15), testEmail]
    );
    const studentId = sRes.insertId;
    const studentUser = await db.one('SELECT * FROM users WHERE id = ?', [uRes.insertId]);
    const studentToken = signToken(studentUser);

    // Allocate bed to resident
    const [aRes] = await db.pool.query(
      "INSERT INTO room_allocations (student_id, bed_id, room_id, hostel_id, academic_year, status) VALUES (?,?,?,?, '2026-27', 'active')",
      [studentId, bed.id, room.id, hostel.id]
    );
    await db.query("UPDATE beds SET status = 'occupied' WHERE id = ?", [bed.id]);
    await db.query("UPDATE rooms SET current_occupancy = current_occupancy + 1 WHERE id = ?", [room.id]);

    // Record some attendance sessions for mess billing calculation
    const today = toDateStr();
    await db.pool.query(
      `INSERT INTO attendance_sessions (student_id, hostel_id, room_id, attendance_date, session, status, marked_by)
       VALUES (?, ?, ?, ?, 'Morning', 'Present', ?),
              (?, ?, ?, ?, 'Evening', 'Present', ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [studentId, hostel.id, room.id, today, wardenUser.id, studentId, hostel.id, room.id, today, wardenUser.id]
    );

    // Record fee structure for caution deposit
    await db.pool.query(
      `INSERT INTO student_fees (student_id, fee_structure_v2_id, academic_year, total_amount, amount_paid, due_date)
       VALUES (?, 1, '2026-27', 67000.00, 67000.00, CURDATE())`,
      [studentId]
    );

    // 4. Test: Student submits exit request
    const exitRes = await fetch(`${baseUrl}/exits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        requestedExitDate: today,
        reason: 'course_completed',
        reasonDetails: 'Final semester completed; vacating hostel.',
      }),
    });
    const exitResult = await exitRes.json();
    assert.strictEqual(exitRes.status, 201, `Exit request failed: ${JSON.stringify(exitResult)}`);
    const exitId = exitResult.data.id;
    console.log(`✔ Step 1: Student requested exit (#${exitId})`);

    // 5. Test: Warden approves exit request
    const approveRes = await fetch(`${baseUrl}/exits/${exitId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wardenToken}`,
      },
      body: JSON.stringify({ remarks: 'Approved. Proceed to room inspection.' }),
    });
    assert.strictEqual(approveRes.status, 200, 'Warden approval must return 200');
    const exitAfterAppr = await (await fetch(`${baseUrl}/exits/${exitId}`, { headers: { Authorization: `Bearer ${wardenToken}` } })).json();
    assert.strictEqual(exitAfterAppr.data.warden_approved_by_name, wardenUser.name, 'Warden approver name must match');
    assert.strictEqual(exitAfterAppr.data.warden_remarks, 'Approved. Proceed to room inspection.');
    console.log(`✔ Step 2: Warden approved exit (#${exitId})`);

    // 6. Test: Room inspection checklist + damage photo upload
    const boundary = '----WebKitFormBoundaryStep9Test' + Math.random().toString(36).substring(2);
    function makeMultipart(fields, files) {
      const parts = [];
      for (const [k, v] of Object.entries(fields)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
      }
      for (const f of files) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.fieldname}"; filename="${f.filename}"\r\nContent-Type: ${f.mimetype}\r\n\r\n`));
        parts.push(f.buffer);
        parts.push(Buffer.from('\r\n'));
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      return Buffer.concat(parts);
    }

    const inspectBody = makeMultipart({
      roomCondition: 'minor_damage',
      inspectionNotes: 'Room key returned. Light bulb broken; study table has minor scratch.',
      damageCharges: '250',
      checklist: JSON.stringify({
        keysReturned: true,
        electricalOk: false,
        furnitureOk: true,
        cleanlinessOk: true,
        plumbingOk: true,
      }),
    }, [
      { fieldname: 'damage_photo', filename: 'broken_light.png', mimetype: 'image/png', buffer: samplePng },
    ]);

    const inspectRes = await fetch(`${baseUrl}/exits/${exitId}/inspect`, {
      method: 'PATCH',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${wardenToken}`,
      },
      body: inspectBody,
    });
    const inspectResult = await inspectRes.json();
    assert.strictEqual(inspectRes.status, 200, `Inspection failed: ${JSON.stringify(inspectResult)}`);
    console.log(`✔ Step 3: Room inspection completed with checklist, damage ₹250, and image proof`);

    // 7. Test: Settlement calculation endpoint
    const settleRes = await fetch(`${baseUrl}/exits/${exitId}/settlement`, {
      headers: { Authorization: `Bearer ${wardenToken}` },
    });
    const settleData = await settleRes.json();
    assert.strictEqual(settleRes.status, 200);
    assert(settleData.data.attendanceSessions >= 2, 'Attendance sessions counted');
    assert.strictEqual(Number(settleData.data.damageCharges), 250, 'Damage charges should be 250');
    assert.strictEqual(Number(settleData.data.cautionDeposit), 5000, 'Caution deposit should be 5000');
    assert.strictEqual(settleData.data.settlementType, 'refundable', 'Net should be refundable because caution deposit exceeds dues');
    console.log(`✔ Step 4: Settlement breakdown verified: Mess ₹${settleData.data.pendingMessBill}, Damages ₹${settleData.data.damageCharges}, Less Caution ₹${settleData.data.cautionDeposit} -> Refundable ₹${settleData.data.netAmount}`);

    // 8. Test: Stream official Settlement Statement PDF
    const pdfRes = await fetch(`${baseUrl}/exits/${exitId}/statement`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(pdfRes.status, 200, 'PDF download should return 200');
    assert.strictEqual(pdfRes.headers.get('content-type'), 'application/pdf');
    const pdfBuffer = await pdfRes.arrayBuffer();
    assert(pdfBuffer.byteLength > 1000, 'PDF buffer must be valid size (>1KB)');
    const pdfHeader = Buffer.from(pdfBuffer.slice(0, 5)).toString();
    assert.strictEqual(pdfHeader, '%PDF-', 'Must be a valid PDF document');
    console.log(`✔ Step 5: Generated official Exit Settlement Statement PDF (${pdfBuffer.byteLength} bytes)`);

    // 9. Test: Final clearance -> releases bed, marks vacated, student exited
    const clearRes = await fetch(`${baseUrl}/exits/${exitId}/clear`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wardenToken}`,
      },
      body: JSON.stringify({
        exitDate: today,
        acknowledgeDues: true,
        remarks: 'Cleared by warden; settlement processed.',
      }),
    });
    assert.strictEqual(clearRes.status, 200, 'Clearance must return 200');

    // Verify bed is released to available
    const bedAfter = await db.one('SELECT status FROM beds WHERE id = ?', [bed.id]);
    assert.strictEqual(bedAfter.status, 'available', 'Bed must be released to available');

    // Verify student status is updated to exited (archived, NOT deleted)
    const studentAfter = await db.one('SELECT hostel_status FROM students WHERE id = ?', [studentId]);
    assert.strictEqual(studentAfter.hostel_status, 'exited', 'Student hostel status must be exited');

    // Verify allocation status is vacated
    const allocAfter = await db.one('SELECT status FROM room_allocations WHERE id = ?', [aRes.insertId]);
    assert.strictEqual(allocAfter.status, 'vacated', 'Allocation status must be vacated');

    // Verify settlement status is settled
    const settlementRow = await db.one('SELECT status FROM exit_settlements WHERE exit_record_id = ?', [exitId]);
    assert.strictEqual(settlementRow.status, 'settled', 'Exit settlement status must be settled');

    console.log(`✔ Step 6: Final clearance executed: bed ${bed.bed_code} released to available, student marked exited, zero data deleted`);

    console.log('\n--- ALL STEP 9 BACKEND TESTS PASSED SUCCESSFULLY! ---');
    process.exit(0);
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('❌ Step 9 verification failed:', err);
  process.exit(1);
});
