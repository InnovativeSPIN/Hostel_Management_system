const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../../helpers');

describe('API: Attendance & Leave Management Lifecycle', () => {
  let c;
  let residentStudent;
  let studentEmail;
  let createdLeaveId;

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
    await c.login(USERS.security[0], USERS.security[1]);

    // Find an active resident student with login in Hostel A
    residentStudent = await db.one(`
      SELECT s.id, s.name, s.email, s.gender, ra.hostel_id, ra.bed_id, h.code AS hostel_code
      FROM students s
      JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
      JOIN hostels h ON h.id = ra.hostel_id
      WHERE h.code = 'A'
      LIMIT 1
    `);
    assert.ok(residentStudent, 'Must have active resident in hostel A');
    studentEmail = residentStudent.email;
    await c.login(studentEmail, 'Student@123');
  });

  describe('Daily Attendance Operations', () => {
    it('GET /api/attendance/roster returns hostel residents with allocation info', async () => {
      const res = await c.as(USERS.warden[0]).get(`/api/attendance/roster?hostelId=${residentStudent.hostel_id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.students.length > 0);
      assert.equal(res.body.data.hostelId, residentStudent.hostel_id);
    });

    it('POST /api/attendance marks attendance for residents on current date', async () => {
      const today = new Date().toISOString().slice(0, 10);
      // Clean up today's record for clean test run
      await db.query('DELETE FROM attendance WHERE student_id = ? AND attendance_date = ?', [residentStudent.id, today]);

      const res = await c.as(USERS.warden[0]).post('/api/attendance', {
        hostelId: residentStudent.hostel_id,
        date: today,
        overwrite: false,
        records: [
          {
            studentId: residentStudent.id,
            status: 'present',
            remarks: 'On-time evening roll call',
          },
        ],
      });
      assert.equal(res.status, 200);

      // Verify in DB
      const record = await db.one('SELECT status FROM attendance WHERE student_id = ? AND attendance_date = ?', [residentStudent.id, today]);
      assert.equal(record.status, 'present');
    });

    it('POST /api/attendance rejects duplicate attendance without overwrite=true', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await c.as(USERS.warden[0]).post('/api/attendance', {
        hostelId: residentStudent.hostel_id,
        date: today,
        overwrite: false,
        records: [
          {
            studentId: residentStudent.id,
            status: 'absent',
          },
        ],
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'DUPLICATE_ATTENDANCE');
    });

    it('POST /api/attendance updates record successfully when overwrite=true', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await c.as(USERS.warden[0]).post('/api/attendance', {
        hostelId: residentStudent.hostel_id,
        date: today,
        overwrite: true,
        records: [
          {
            studentId: residentStudent.id,
            status: 'late',
            remarks: 'Permitted late entry by warden',
          },
        ],
      });
      assert.equal(res.status, 200);

      const record = await db.one('SELECT status FROM attendance WHERE student_id = ? AND attendance_date = ?', [residentStudent.id, today]);
      assert.equal(record.status, 'late');
    });

    it('auto-converts absent to on_leave if student has an active approved leave', async () => {
      const leave = await db.one(`
        SELECT lr.student_id, ra.hostel_id, lr.from_date, lr.to_date
        FROM leave_requests lr
        JOIN room_allocations ra ON ra.student_id = lr.student_id AND ra.status = 'active'
        WHERE lr.status = 'approved' AND CURDATE() BETWEEN lr.from_date AND lr.to_date
        LIMIT 1
      `);

      if (leave) {
        const today = new Date().toISOString().slice(0, 10);
        await db.query('DELETE FROM attendance WHERE student_id = ? AND attendance_date = ?', [leave.student_id, today]);

        const res = await c.as(USERS.warden[0]).post('/api/attendance', {
          hostelId: leave.hostel_id,
          date: today,
          overwrite: false,
          records: [
            {
              studentId: leave.student_id,
              status: 'absent',
            },
          ],
        });
        assert.equal(res.status, 200);

        const att = await db.one('SELECT status FROM attendance WHERE student_id = ? AND attendance_date = ?', [leave.student_id, today]);
        assert.equal(att.status, 'on_leave', 'Must convert absent to on_leave during approved leave period');
      }
    });
  });

  describe('Leave Request Lifecycle & Constraints', () => {
    it('resident applies for leave with valid starting dates', async () => {
      // Find a resident in hostel A without pending/approved leaves
      const resident = await db.one(`
        SELECT s.id, s.email FROM students s
        JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
        JOIN hostels h ON h.id = ra.hostel_id
        WHERE h.code = 'A'
          AND NOT EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.student_id = s.id AND lr.status IN ('pending', 'approved'))
        LIMIT 1
      `);
      assert.ok(resident, 'Must find resident in hostel A');
      await c.login(resident.email, 'Student@123');

      const today = new Date().toISOString().slice(0, 10);
      const futureEnd = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

      const res = await c.as(resident.email).post('/api/leaves', {
        leaveType: 'home',
        fromDate: today,
        toDate: futureEnd,
        expectedReturnAt: `${futureEnd} 20:00`,
        reason: 'Attending family ceremony',
        destination: 'Coimbatore',
        guardianContact: '9842100000',
        emergencyContact: '9842100001',
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.leaveCode);
      createdLeaveId = res.body.data.id;

      // Verify overlapping leave rejection
      const overlapRes = await c.as(resident.email).post('/api/leaves', {
        leaveType: 'medical',
        fromDate: today,
        toDate: futureEnd,
        expectedReturnAt: `${futureEnd} 21:00`,
        reason: 'Overlapping request test',
        destination: 'Hospital',
        guardianContact: '9842100000',
        emergencyContact: '9842100001',
      });
      assert.equal(overlapRes.status, 409);
      assert.equal(overlapRes.body.code, 'LEAVE_OVERLAP');
    });

    it('warden approves the newly submitted future leave request', async () => {
      assert.ok(createdLeaveId, 'Must have leave created in previous test');
      const res = await c.as(USERS.warden[0]).patch(`/api/leaves/${createdLeaveId}/approve`, {
        remarks: 'Approved by hostel warden',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'approved');
    });

    it('gate security logs departure and return for approved leave', async () => {
      assert.ok(createdLeaveId, 'Must have approved leave ID');
      // Record departure
      const depRes = await c.as(USERS.security[0]).patch(`/api/leaves/${createdLeaveId}/depart`);
      assert.equal(depRes.status, 200);

      // Record return
      const retRes = await c.as(USERS.security[0]).patch(`/api/leaves/${createdLeaveId}/return`, {
        remarks: 'Returned to campus safely',
      });
      assert.equal(retRes.status, 200);
    });
  });
});
