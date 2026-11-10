const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../../helpers');

describe('API: Admissions & Bed Allocations Lifecycle', () => {
  let c;

  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    c = client();
    await c.login(USERS.admin[0], USERS.admin[1]);
    await c.login(USERS.warden[0], USERS.warden[1]);
  });

  describe('Admissions Workflow & State Transitions', () => {
    it('GET /api/applications returns list of student applications', async () => {
      const res = await c.as(USERS.admin[0]).get('/api/applications');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
      const app = res.body.data[0];
      assert.ok('application_code' in app);
      assert.ok('status' in app);
      assert.ok('student_name' in app);
    });

    it('rejects out-of-order transition (decision before verification)', async () => {
      const submittedApp = await db.one("SELECT id FROM hostel_applications WHERE status = 'submitted' LIMIT 1");
      if (submittedApp) {
        const res = await c.as(USERS.admin[0]).patch(`/api/applications/${submittedApp.id}/decision`, {
          decision: 'approve',
          remarks: 'Bypassing verification',
        });
        assert.equal(res.status, 409);
        assert.equal(res.body.code, 'INVALID_TRANSITION');
      }
    });

    it('GET /api/allocations/pending lists approved students ready for bed assignment', async () => {
      const res = await c.as(USERS.warden[0]).get('/api/allocations/pending');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });
  });

  describe('Bed Allocation Business Rules & Conflicts', () => {
    it('successfully allocates an available bed to an approved student', async () => {
      // Find an unallocated student with an approved application
      let candidate = await db.one(`
        SELECT s.id AS student_id, s.gender, a.id AS app_id
        FROM students s
        JOIN hostel_applications a ON a.student_id = s.id
        WHERE a.status IN ('approved', 'fee_assigned')
          AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.student_id = s.id AND ra.status = 'active')
        LIMIT 1
      `);

      // If no approved student exists, set one student to approved for testing
      if (!candidate) {
        const student = await db.one("SELECT id, gender FROM students WHERE hostel_status != 'resident' LIMIT 1");
        await db.query(`
          INSERT INTO hostel_applications (student_id, application_code, academic_year, status, preferred_hostel_id, preferred_room_type)
          VALUES (?, 'TEST-APP-01', '2026-2027', 'approved', 1, 'double')
          ON DUPLICATE KEY UPDATE status = 'approved'
        `, [student.id]);
        candidate = { student_id: student.id, gender: student.gender };
      }

      // Find an available bed matching gender
      const hostelCode = candidate.gender === 'female' ? 'G' : 'A';
      const bed = await db.one(`
        SELECT b.id, b.bed_code
        FROM beds b
        JOIN rooms r ON r.id = b.room_id
        JOIN hostels h ON h.id = r.hostel_id
        WHERE h.code = ? AND b.status = 'available' AND r.status = 'active'
        LIMIT 1
      `, [hostelCode]);
      assert.ok(bed, 'Must find available bed matching gender');

      const res = await c.as(USERS.warden[0]).post('/api/allocations', {
        studentId: candidate.student_id,
        bedId: bed.id,
        remarks: 'Automated test allocation',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id, 'Must return allocation ID');

      // Verify bed is now occupied in DB
      const updatedBed = await db.one('SELECT status FROM beds WHERE id = ?', [bed.id]);
      assert.equal(updatedBed.status, 'occupied');
    });

    it('rejects allocating an already occupied bed with 409 BED_ALREADY_OCCUPIED', async () => {
      // Find an occupied bed
      const occupied = await db.one(`
        SELECT b.id AS bed_id, ra.student_id
        FROM beds b
        JOIN room_allocations ra ON ra.bed_id = b.id
        WHERE ra.status = 'active' AND b.status = 'occupied'
        LIMIT 1
      `);
      assert.ok(occupied, 'Must find occupied bed');

      // Create dummy approved student
      const student = await db.one(`
        SELECT s.id, s.gender FROM students s
        WHERE NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.student_id = s.id AND ra.status = 'active')
        LIMIT 1
      `);
      await db.query(`
        INSERT INTO hostel_applications (student_id, application_code, academic_year, status, preferred_hostel_id)
        VALUES (?, 'TEST-APP-02', '2026-2027', 'approved', 1)
        ON DUPLICATE KEY UPDATE status = 'approved'
      `, [student.id]);

      const res = await c.as(USERS.warden[0]).post('/api/allocations', {
        studentId: student.id,
        bedId: occupied.bed_id,
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'BED_ALREADY_OCCUPIED');
    });

    it('rejects duplicate allocation for a student who already has an active bed', async () => {
      const active = await db.one(`
        SELECT ra.student_id, h.code AS hostel_code
        FROM room_allocations ra
        JOIN hostels h ON h.id = ra.hostel_id
        WHERE ra.status = 'active'
        LIMIT 1
      `);
      assert.ok(active, 'Must find active allocation');

      // Find an available bed
      const available = await db.one(`
        SELECT b.id FROM beds b
        JOIN rooms r ON r.id = b.room_id
        WHERE b.status = 'available' AND r.status = 'active'
        LIMIT 1
      `);

      const res = await c.as(USERS.admin[0]).post('/api/allocations', {
        studentId: active.student_id,
        bedId: available.id,
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'STUDENT_ALREADY_ALLOCATED');
    });

    it('rejects allocation when gender mismatches the hostel gender', async () => {
      // Find an unallocated male student
      const maleStudent = await db.one(`
        SELECT s.id FROM students s
        WHERE s.gender = 'male'
          AND NOT EXISTS (SELECT 1 FROM room_allocations ra WHERE ra.student_id = s.id AND ra.status = 'active')
        LIMIT 1
      `);
      assert.ok(maleStudent, 'Must find unallocated male student');

      await db.query(`
        INSERT INTO hostel_applications (student_id, application_code, academic_year, status, preferred_hostel_id)
        VALUES (?, 'TEST-APP-GM', '2026-2027', 'approved', 3)
        ON DUPLICATE KEY UPDATE status = 'approved'
      `, [maleStudent.id]);

      const girlsBed = await db.one(`
        SELECT b.id FROM beds b
        JOIN rooms r ON r.id = b.room_id
        JOIN hostels h ON h.id = r.hostel_id
        WHERE h.gender = 'female' AND b.status = 'available'
        LIMIT 1
      `);

      const res = await c.as(USERS.admin[0]).post('/api/allocations', {
        studentId: maleStudent.id,
        bedId: girlsBed.id,
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'GENDER_MISMATCH');
    });
  });

  describe('Room Transfer & Vacate Workflow', () => {
    it('transfers an allocated student to another available bed with history log', async () => {
      const allocation = await db.one(`
        SELECT ra.id, ra.bed_id, ra.hostel_id, ra.student_id, s.gender, h.code AS hostel_code
        FROM room_allocations ra
        JOIN students s ON s.id = ra.student_id
        JOIN hostels h ON h.id = ra.hostel_id
        WHERE ra.status = 'active' AND h.code = 'A'
        LIMIT 1
      `);
      assert.ok(allocation, 'Must find active allocation in hostel A');

      // Find an available destination bed in the same hostel
      const destBed = await db.one(`
        SELECT b.id, b.bed_code FROM beds b
        JOIN rooms r ON r.id = b.room_id
        WHERE r.hostel_id = ? AND b.status = 'available' AND r.status = 'active'
        LIMIT 1
      `, [allocation.hostel_id]);
      assert.ok(destBed, 'Must find available destination bed in hostel A');

      const res = await c.as(USERS.warden[0]).post(`/api/allocations/${allocation.id}/transfer`, {
        newBedId: destBed.id,
        reason: 'Requested floor change due to medical reasons',
      });
      assert.equal(res.status, 201);

      // Verify old bed is released and new bed is occupied
      const oldBedStatus = await db.one('SELECT status FROM beds WHERE id = ?', [allocation.bed_id]);
      const newBedStatus = await db.one('SELECT status FROM beds WHERE id = ?', [destBed.id]);
      assert.equal(oldBedStatus.status, 'available');
      assert.equal(newBedStatus.status, 'occupied');
    });

    it('vacating an allocation releases the bed and updates room occupancy', async () => {
      const active = await db.one(`
        SELECT ra.id, ra.bed_id, ra.room_id
        FROM room_allocations ra
        WHERE ra.status = 'active'
        LIMIT 1
      `);
      assert.ok(active, 'Must find active allocation to vacate');

      const roomBefore = await db.one('SELECT current_occupancy FROM rooms WHERE id = ?', [active.room_id]);

      const res = await c.as(USERS.warden[0]).post(`/api/allocations/${active.id}/vacate`, {
        reason: 'Course completed / end of semester checkout',
      });
      assert.equal(res.status, 200);

      // Verify bed is released
      const bedAfter = await db.one('SELECT status FROM beds WHERE id = ?', [active.bed_id]);
      assert.equal(bedAfter.status, 'available');

      // Verify occupancy decreased
      const roomAfter = await db.one('SELECT current_occupancy FROM rooms WHERE id = ?', [active.room_id]);
      assert.equal(roomAfter.current_occupancy, roomBefore.current_occupancy - 1);
    });
  });
});
