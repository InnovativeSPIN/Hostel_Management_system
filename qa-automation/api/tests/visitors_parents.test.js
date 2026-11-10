const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../../helpers');

describe('API: Visitors & Parent Portal Scoped Access', () => {
  let c;
  let residentStudent;
  let unlinkedStudent;

  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    c = client();
    await c.login(USERS.admin[0], USERS.admin[1]);
    await c.login(USERS.security[0], USERS.security[1]);
    await c.login(USERS.parent[0], USERS.parent[1]);

    // Linked child 1 (Arun Kumar S)
    residentStudent = await db.one('SELECT id, name, user_id FROM students WHERE id = 1');
    assert.ok(residentStudent);

    // Unlinked student (e.g. Karthik Raja M id 2)
    unlinkedStudent = await db.one(`
      SELECT s.id, s.name FROM students s
      WHERE s.id NOT IN (SELECT student_id FROM parent_students WHERE parent_user_id = 101)
      LIMIT 1
    `);
    assert.ok(unlinkedStudent);
  });

  describe('Visitor Gate Desk Lifecycle', () => {
    it('security checks in a visitor for resident student', async () => {
      const res = await c.as(USERS.security[0]).post('/api/visitors', {
        name: 'Venkatesh R',
        phone: '9840199999',
        idProofType: 'aadhaar',
        idProofNumber: '9988-7766-5544',
        studentId: residentStudent.id,
        relationship: 'Uncle',
        purpose: 'Delivering books and medicines',
        checkInNow: true,
        override: true,
        remarks: 'Authorized family visit',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.passCode);
      assert.equal(res.body.data.status, 'checked_in');
    });

    it('rejects duplicate check-in while visitor is currently inside campus', async () => {
      const res = await c.as(USERS.security[0]).post('/api/visitors', {
        name: 'Venkatesh R',
        phone: '9840199999', // same phone/visitor currently inside
        idProofType: 'aadhaar',
        idProofNumber: '9988-7766-5544',
        studentId: residentStudent.id,
        relationship: 'Uncle',
        purpose: 'Second attempt check-in',
        checkInNow: true,
        override: true,
        remarks: 'Attempt while already inside',
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'VISITOR_ALREADY_INSIDE');
    });

    it('security checks out visitor releasing them from campus', async () => {
      const entry = await db.one("SELECT id FROM visitor_entries WHERE status = 'checked_in' LIMIT 1");
      assert.ok(entry, 'Must find checked-in entry');

      const res = await c.as(USERS.security[0]).post(`/api/visitors/${entry.id}/check-out`);
      assert.equal(res.status, 200);

      const updated = await db.one('SELECT status, exit_time FROM visitor_entries WHERE id = ?', [entry.id]);
      assert.equal(updated.status, 'checked_out');
      assert.ok(updated.exit_time);
    });
  });

  describe('Parent Portal Scoping & IDOR Prevention', () => {
    it('parent retrieves overview cards for linked children only', async () => {
      const res = await c.as(USERS.parent[0]).get('/api/parents/children');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data.some((ch) => ch.id === residentStudent.id));
      assert.ok(!res.body.data.some((ch) => ch.id === unlinkedStudent.id));
    });

    it('parent views detailed records of linked child', async () => {
      const res = await c.as(USERS.parent[0]).get(`/api/parents/children/${residentStudent.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.student.id, residentStudent.id);
      assert.ok('allocation' in res.body.data);
      assert.ok('fees' in res.body.data);
    });

    it('blocks IDOR: parent cannot access records of an unlinked student', async () => {
      const res = await c.as(USERS.parent[0]).get(`/api/parents/children/${unlinkedStudent.id}`);
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    it('enforces RBAC: parent is blocked from accessing administrative endpoints', async () => {
      const res1 = await c.as(USERS.parent[0]).get('/api/students');
      assert.equal(res1.status, 403);

      const res2 = await c.as(USERS.parent[0]).get('/api/fees');
      assert.equal(res2.status, 403);

      const res3 = await c.as(USERS.parent[0]).get('/api/hostels/1');
      assert.equal(res3.status, 403);
    });
  });
});
