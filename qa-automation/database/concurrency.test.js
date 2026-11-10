const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../helpers');

describe('Database: High Concurrency & Transaction Isolation', () => {
  let c;

  before(async () => {
    await resetDatabase();
    c = client();
    await c.login(USERS.admin[0], USERS.admin[1]);
  });

  after(async () => {
    await cleanup();
  });

  it('10 simultaneous allocation requests for the SAME bed results in exactly 1 success and 9 conflicts', async () => {
    // 1. Pick an available bed in Hostel A (boys)
    const bed = await db.one(`
      SELECT b.id, b.bed_code, r.id AS room_id, r.current_occupancy
      FROM beds b
      JOIN rooms r ON r.id = b.room_id
      JOIN hostels h ON h.id = r.hostel_id
      WHERE h.code = 'A' AND b.status = 'available' AND r.status = 'active'
      ORDER BY b.id ASC
      LIMIT 1
    `);
    assert.ok(bed, 'Must find an available bed in hostel A');

    // 2. Select 10 real male students from database and ensure they are unallocated
    const candidateStudents = await db.query(`
      SELECT id, name FROM students WHERE gender = 'male' ORDER BY id ASC LIMIT 10
    `);
    assert.equal(candidateStudents.length, 10, 'Must have at least 10 male students');
    const studentIds = candidateStudents.map((s) => s.id);

    // Vacate any existing allocations for these 10 students
    await db.query("UPDATE room_allocations SET status = 'vacated', ended_at = NOW() WHERE student_id IN (?)", [studentIds]);

    // Ensure all 10 candidates have an approved hostel application
    for (const student of candidateStudents) {
      await db.query(`
        INSERT INTO hostel_applications (student_id, application_code, academic_year, status, preferred_hostel_id, preferred_room_type)
        VALUES (?, CONCAT('RACE-APP-', ?), '2026-2027', 'approved', 1, 'double')
        ON DUPLICATE KEY UPDATE status = 'approved'
      `, [student.id, student.id]);
    }

    // 3. Fire 10 simultaneous allocation requests at the exact same millisecond
    console.log(`Firing 10 simultaneous allocations for Bed ${bed.bed_code} (ID: ${bed.id})...`);
    const requests = candidateStudents.map((student) =>
      c.as(USERS.admin[0]).post('/api/allocations', {
        studentId: student.id,
        bedId: bed.id,
        remarks: `Concurrent race test candidate ${student.id}`,
      })
    );

    const responses = await Promise.all(requests);

    // 4. Analyze results
    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    console.log(`Concurrency Results: ${successes.length} Succeeded, ${conflicts.length} Conflicts (409)`);

    // 5. Strict Assertions
    assert.equal(successes.length, 1, 'CRITICAL: Exactly ONE request must succeed in claiming the bed');
    assert.equal(conflicts.length, 9, 'CRITICAL: Exactly NINE requests must be rejected with HTTP 409 Conflict');

    for (const conflictRes of conflicts) {
      assert.equal(conflictRes.body.success, false);
      assert.equal(conflictRes.body.code, 'BED_ALREADY_OCCUPIED', 'Error code must be BED_ALREADY_OCCUPIED');
    }

    // 6. Database Verification
    const activeAllocations = await db.query(
      "SELECT id, student_id, status FROM room_allocations WHERE bed_id = ? AND status = 'active'",
      [bed.id]
    );
    assert.equal(activeAllocations.length, 1, 'Database must have exactly 1 active allocation for this bed');

    const updatedBed = await db.one('SELECT status FROM beds WHERE id = ?', [bed.id]);
    assert.equal(updatedBed.status, 'occupied', 'Bed status in database must be occupied');

    const updatedRoom = await db.one('SELECT current_occupancy FROM rooms WHERE id = ?', [bed.room_id]);
    assert.equal(
      updatedRoom.current_occupancy,
      bed.current_occupancy + 1,
      'Room occupancy must have incremented by exactly 1'
    );
  });
});
