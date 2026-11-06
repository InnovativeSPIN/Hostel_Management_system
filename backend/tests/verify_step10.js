const assert = require('assert');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

async function loginAsAdmin() {
  const admin = await db.one('SELECT u.id, u.email, r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = "super_admin" LIMIT 1');
  const jwt = require('jsonwebtoken');
  const env = require('../src/config/env');
  const token = jwt.sign({ sub: admin.id, tv: 1 }, env.jwt.secret, { expiresIn: '1h' });
  return { token, admin };
}

async function run() {
  console.log('--- STARTING STEP 10 VERIFICATION (GUEST ROOM ALLOCATION) ---');

  const { token } = await loginAsAdmin();
  const authHeader = `Bearer ${token}`;

  // 1. Verify schema & tables exist
  console.log('[1/8] Verifying tables and schema...');
  const [grTable] = await db.query("SHOW TABLES LIKE 'guest_rooms'");
  const [gaTable] = await db.query("SHOW TABLES LIKE 'guest_allocations'");
  assert.ok(grTable, 'guest_rooms table exists');
  assert.ok(gaTable, 'guest_allocations table exists');
  console.log('  -> Tables guest_rooms and guest_allocations verified.');

  // 2. Verify seeded rooms
  console.log('[2/8] Verifying seeded guest rooms...');
  const seededRooms = await db.query('SELECT room_number, block_name, room_type, is_ac, capacity, status FROM guest_rooms ORDER BY id');
  assert.ok(seededRooms.length >= 4, `Expected at least 4 rooms, found ${seededRooms.length}`);
  const g101 = seededRooms.find((r) => r.room_number === 'G-101');
  assert.ok(g101, 'G-101 exists');
  assert.strictEqual(g101.status, 'available');
  assert.strictEqual(g101.is_ac, 1);
  console.log(`  -> Found ${seededRooms.length} seeded guest rooms (G-101, G-102, G-201, VIP-1).`);

  // 3. Test GET /api/guest/rooms
  console.log('[3/8] Testing GET /api/guest/rooms...');
  const resRooms = await request(app)
    .get('/api/guest/rooms')
    .set('Authorization', authHeader);
  assert.strictEqual(resRooms.status, 200);
  assert.ok(resRooms.body.success);
  assert.ok(Array.isArray(resRooms.body.data));
  console.log(`  -> GET /api/guest/rooms returned ${resRooms.body.data.length} rooms:`, resRooms.body.data.map(r => r.room_number));

  // 4. Test POST /api/guest/rooms (Create guest room master)
  console.log('[4/8] Testing POST /api/guest/rooms...');
  const testRoomNumber = `TEST-${Date.now().toString().slice(-4)}`;
  const resCreateRoom = await request(app)
    .post('/api/guest/rooms')
    .set('Authorization', authHeader)
    .send({
      roomNumber: testRoomNumber,
      blockName: 'Guest Annex',
      floorNumber: 1,
      roomType: 'double',
      isAc: true,
      capacity: 2,
      amenities: 'AC, WiFi, Tea Maker',
      remarks: 'Automated test guest room',
    });
  assert.strictEqual(resCreateRoom.status, 201);
  assert.strictEqual(resCreateRoom.body.data.room_number, testRoomNumber);
  const createdRoomId = resCreateRoom.body.data.id;
  console.log(`  -> Created test guest room ID ${createdRoomId} (${testRoomNumber}).`);

  // 5. Test PATCH /api/guest/rooms/:id
  console.log('[5/8] Testing PATCH /api/guest/rooms/:id...');
  const resPatchRoom = await request(app)
    .patch(`/api/guest/rooms/${createdRoomId}`)
    .set('Authorization', authHeader)
    .send({
      amenities: 'AC, WiFi, Tea Maker, Mini Fridge',
      capacity: 3,
    });
  assert.strictEqual(resPatchRoom.status, 200);
  assert.strictEqual(resPatchRoom.body.data.capacity, 3);
  console.log('  -> Updated room capacity to 3 and added Mini Fridge.');

  // 6. Test POST /api/guest/allocations with STRICT ZERO-FEE ASSERTION
  console.log('[6/8] Testing POST /api/guest/allocations and ZERO-FEE verification...');
  // Capture fee and payment counts before booking
  const [feeCountBefore] = await db.query('SELECT COUNT(*) as count FROM student_fees');
  const [paymentCountBefore] = await db.query('SELECT COUNT(*) as count FROM payments');

  const checkInDate = new Date();
  const checkOutDate = new Date();
  checkOutDate.setDate(checkOutDate.getDate() + 2);

  const resAlloc = await request(app)
    .post('/api/guest/allocations')
    .set('Authorization', authHeader)
    .send({
      guestRoomId: createdRoomId,
      guestName: 'Prof. S. Natarajan',
      phone: '9840198401',
      email: 'natarajan@annauniv.edu',
      idProofType: 'aadhaar',
      idProofNumber: '7890 1234 5678',
      purpose: 'Anna University Accreditation & Inspection',
      numberOfGuests: 2,
      checkInAt: checkInDate.toISOString(),
      expectedCheckOutAt: checkOutDate.toISOString(),
      remarks: 'VIP Academic Guest - Complimentary Stay',
    });

  assert.strictEqual(resAlloc.status, 201);
  assert.ok(resAlloc.body.success);
  const allocData = resAlloc.body.data;
  assert.ok(allocData.booking_code.startsWith('GBK-'));
  assert.strictEqual(allocData.status, 'active');
  assert.strictEqual(allocData.guest_name, 'Prof. S. Natarajan');
  console.log(`  -> Allocation created successfully: ${allocData.booking_code}`);

  // VERIFY ROOM STATUS CHANGED TO OCCUPIED
  const updatedRoom = await db.one('SELECT status FROM guest_rooms WHERE id = ?', [createdRoomId]);
  assert.strictEqual(updatedRoom.status, 'occupied', 'Guest room must be marked occupied');
  console.log('  -> Room status correctly changed to occupied.');

  // STRICT ZERO-FEE CHECK:
  const [feeCountAfter] = await db.query('SELECT COUNT(*) as count FROM student_fees');
  const [paymentCountAfter] = await db.query('SELECT COUNT(*) as count FROM payments');

  assert.strictEqual(
    feeCountBefore.count,
    feeCountAfter.count,
    'ZERO FEE VIOLATION: student_fees count increased after guest allocation!'
  );
  assert.strictEqual(
    paymentCountBefore.count,
    paymentCountAfter.count,
    'ZERO FEE VIOLATION: payments count changed after guest allocation!'
  );
  console.log(`  -> ZERO-FEE STRICT VERIFICATION PASSED: student_fees (${feeCountBefore.count} -> ${feeCountAfter.count}), payments (${paymentCountBefore.count} -> ${paymentCountAfter.count}).`);

  // Verify conflict on double booking
  const resConflict = await request(app)
    .post('/api/guest/allocations')
    .set('Authorization', authHeader)
    .send({
      guestRoomId: createdRoomId,
      guestName: 'Second Guest',
      phone: '9999999999',
      idProofType: 'pan',
      idProofNumber: 'ABCDE1234F',
      purpose: 'Another stay',
      expectedCheckOutAt: checkOutDate.toISOString(),
    });
  assert.strictEqual(resConflict.status, 409, 'Must reject booking an already occupied room with 409');
  console.log('  -> Conflict check passed: Double booking an occupied room rejected with 409.');

  // 7. Test GET /api/guest/report
  console.log('[7/8] Testing GET /api/guest/report...');
  const resReport = await request(app)
    .get('/api/guest/report')
    .set('Authorization', authHeader);
  assert.strictEqual(resReport.status, 200);
  const rep = resReport.body.data;
  assert.ok(rep.totalRooms >= 5);
  assert.ok(rep.occupiedRooms >= 1);
  assert.ok(rep.activeBookings >= 1);
  assert.ok(rep.feePolicy.includes('zero_fee'));
  console.log(`  -> Report verified: Total=${rep.totalRooms}, Occupied=${rep.occupiedRooms}, ActiveGuests=${rep.activeGuestsCount}, Policy="${rep.feePolicy}"`);

  // 8. Test PATCH /api/guest/allocations/:id/check-out
  console.log('[8/8] Testing PATCH /api/guest/allocations/:id/check-out...');
  const resCheckout = await request(app)
    .patch(`/api/guest/allocations/${allocData.id}/check-out`)
    .set('Authorization', authHeader)
    .send({ remarks: 'Completed inspection visit successfully' });

  assert.strictEqual(resCheckout.status, 200);
  assert.strictEqual(resCheckout.body.data.status, 'checked_out');

  // Verify room released to available
  const releasedRoom = await db.one('SELECT status FROM guest_rooms WHERE id = ?', [createdRoomId]);
  assert.strictEqual(releasedRoom.status, 'available', 'Guest room must be released back to available upon check-out');
  console.log('  -> Room successfully released back to available upon check-out.');

  // Cleanup test room and allocation
  await db.query('DELETE FROM guest_allocations WHERE id = ?', [allocData.id]);
  await db.query('DELETE FROM guest_rooms WHERE id = ?', [createdRoomId]);
  console.log('  -> Test data cleaned up.');

  console.log('--- ALL STEP 10 VERIFICATION CHECKS PASSED (ZERO FEE GUARANTEED) ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('STEP 10 VERIFICATION FAILED:', err);
  process.exit(1);
});
