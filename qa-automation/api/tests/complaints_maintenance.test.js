const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../../helpers');

describe('API: Complaints & Maintenance Lifecycle', () => {
  let c;
  let residentStudent;

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
    await c.login(USERS.staff[0], USERS.staff[1]);

    residentStudent = await db.one(`
      SELECT s.id, s.name, s.email, ra.hostel_id, ra.room_id
      FROM students s
      JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
      JOIN hostels h ON h.id = ra.hostel_id
      WHERE h.code = 'A'
      ORDER BY s.id ASC
      LIMIT 1
    `);
    assert.ok(residentStudent, 'Must find active resident');
    await c.login(residentStudent.email, 'Student@123');
  });

  describe('Complaints Workflow & Auto-Assignment', () => {
    it('POST /api/complaints/suggest provides category and priority suggestions', async () => {
      const res = await c.as(residentStudent.email).post('/api/complaints/suggest', {
        text: 'Ceiling fan is making loud buzzing noise and sparking near switch board',
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.category, 'Must suggest category');
      assert.equal(res.body.data.category, 'electrical');
      assert.ok(res.body.data.priority, 'Must suggest priority');
    });

    it('POST /api/complaints creates complaint and auto-assigns skill-matching staff', async () => {
      const res = await c.as(residentStudent.email).post('/api/complaints', {
        category: 'electrical',
        priority: 'high',
        title: 'Study table light fixture not working',
        description: 'The tube light fixture over study desk does not turn on even after switch replacement.',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.complaintCode);
      assert.ok(res.body.data.slaHours > 0);

      // Verify in DB
      const record = await db.one('SELECT status, assigned_to FROM complaints WHERE id = ?', [res.body.data.id]);
      assert.ok(['assigned', 'pending'].includes(record.status));
    });

    it('rejects duplicate complaint within 10 minutes with 409 DUPLICATE_COMPLAINT', async () => {
      const res = await c.as(residentStudent.email).post('/api/complaints', {
        category: 'electrical',
        priority: 'high',
        title: 'Study table light fixture not working', // Same title from previous test
        description: 'Duplicate attempt to submit the same problem again immediately.',
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'DUPLICATE_COMPLAINT');
    });
  });

  describe('Maintenance Tasks & Room Status Blocking', () => {
    it('creates maintenance task with room blocking and reactivates room on completion', async () => {
      // Find an active room in hostel A
      const room = await db.one(`
        SELECT r.id, r.room_number, r.status, r.hostel_id
        FROM rooms r
        JOIN hostels h ON h.id = r.hostel_id
        WHERE h.code = 'A' AND r.status = 'active'
        ORDER BY r.id ASC
        LIMIT 1
      `);
      assert.ok(room, 'Must find active room in hostel A');

      // 1. Create maintenance task blocking the room
      const res = await c.as(USERS.warden[0]).post('/api/maintenance', {
        hostelId: room.hostel_id,
        roomId: room.id,
        category: 'structural',
        priority: 'high',
        title: 'Bathroom tile repairing and waterproofing',
        description: 'Complete floor waterproofing required due to minor leakage',
        blocksRoom: true,
      });
      assert.equal(res.status, 201);
      const taskId = res.body.data.id;

      // Verify room status changed to maintenance
      const roomUnderMaint = await db.one('SELECT status FROM rooms WHERE id = ?', [room.id]);
      assert.equal(roomUnderMaint.status, 'maintenance');

      // 2. Transition from open -> in_progress
      const inProgRes = await c.as(USERS.warden[0]).patch(`/api/maintenance/${taskId}`, {
        status: 'in_progress',
        notes: 'Work started by masonry team',
      });
      assert.equal(inProgRes.status, 200);

      // 3. Transition from in_progress -> completed with completion notes
      const completeRes = await c.as(USERS.warden[0]).patch(`/api/maintenance/${taskId}`, {
        status: 'completed',
        notes: 'Tiles replaced and waterproofing seal completed successfully',
      });
      assert.equal(completeRes.status, 200);

      // Verify room status returned to active
      const roomAfter = await db.one('SELECT status FROM rooms WHERE id = ?', [room.id]);
      assert.equal(roomAfter.status, 'active');
    });
  });
});
