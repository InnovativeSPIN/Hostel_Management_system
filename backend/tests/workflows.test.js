// End-to-end workflow tests against an isolated MySQL database (<DB_NAME>_test).
// Run: npm test
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { resetDatabase, client, USERS } = require('./helpers');

let app; let db; let api; let jobs;
const student = {};

before(async () => {
  await resetDatabase();
  app = require('../src/app');
  db = require('../src/config/db');
  jobs = require('../src/jobs/scheduler');
  api = client(app);
  for (const [email, pwd] of Object.values(USERS)) await api.login(email, pwd);
  // Student accounts used across tests.
  const rows = await db.query(
    `SELECT s.id, s.name, s.email, s.hostel_status, s.gender FROM students s
      WHERE s.name IN ('Udhayakumar P','Vishnu Vardhan S','Yuvaraj M','Shalini Prabhu','Arun Kumar S','Karthik Raja M','Priya Dharshini S')`);
  rows.forEach((r) => { student[r.name.split(' ')[0].toLowerCase()] = r; });
  for (const s of Object.values(student)) await api.login(s.email, 'Student@123');
});

after(async () => { await db.pool.end(); });

const as = (key) => api.as(USERS[key] ? USERS[key][0] : student[key].email);
const availableBed = (hostelCode) => db.one(
  `SELECT b.id, b.bed_code, r.id AS room_id FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
    WHERE h.code = ? AND b.status = 'available' AND r.status = 'active' ORDER BY b.id LIMIT 1`, [hostelCode]);

describe('Authentication & RBAC', () => {
  it('logs in with correct credentials', async () => {
    const data = await api.login(...USERS.admin);
    assert.equal(data.user.role, 'super_admin');
    assert.ok(data.token);
    assert.equal(data.user.password_hash, undefined);
  });

  it('rejects an incorrect password without revealing which part was wrong', async () => {
    const res = await require('supertest')(app).post('/api/auth/login').send({ email: USERS.staff[0], password: 'wrong-pass1' });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  it('rejects requests without a token', async () => {
    const res = await require('supertest')(app).get('/api/students');
    assert.equal(res.status, 401);
  });

  it('rejects an expired token', async () => {
    const u = await db.one('SELECT id, token_version FROM users WHERE email = ?', [USERS.admin[0]]);
    const expired = jwt.sign({ sub: u.id, tv: u.token_version }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await require('supertest')(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'TOKEN_EXPIRED');
  });

  it('enforces role restrictions', async () => {
    assert.equal((await as('arun').get('/api/users')).status, 403);
    assert.equal((await as('security').get('/api/fees')).status, 403);
    assert.equal((await as('staff').get('/api/audit')).status, 403);
  });

  it('scopes wardens to their own hostels', async () => {
    const girlsRoom = await db.one("SELECT r.id FROM rooms r JOIN hostels h ON h.id = r.hostel_id WHERE h.code = 'G' LIMIT 1");
    assert.equal((await as('warden').get(`/api/rooms/${girlsRoom.id}`)).status, 403);
    assert.equal((await as('wardenGirls').get(`/api/rooms/${girlsRoom.id}`)).status, 200);
  });
});

describe('Room allocation engine', () => {
  it('allocates an available bed to an approved student', async () => {
    const bed = await availableBed('A');
    const res = await as('warden').post('/api/allocations', { studentId: student.udhayakumar.id, bedId: bed.id });
    assert.equal(res.status, 201, res.body.message);
    const b = await db.one('SELECT status FROM beds WHERE id = ?', [bed.id]);
    assert.equal(b.status, 'occupied');
    const s = await db.one('SELECT hostel_status FROM students WHERE id = ?', [student.udhayakumar.id]);
    assert.equal(s.hostel_status, 'resident');
  });

  it('refuses a second active allocation for the same student', async () => {
    const bed = await availableBed('A');
    const res = await as('warden').post('/api/allocations', { studentId: student.udhayakumar.id, bedId: bed.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'STUDENT_ALREADY_ALLOCATED');
  });

  it('refuses students without approved admission', async () => {
    const bed = await availableBed('A');
    const res = await as('warden').post('/api/allocations', { studentId: student.vishnu.id, bedId: bed.id });
    assert.equal(res.body.code, 'ADMISSION_NOT_APPROVED');
  });

  it('refuses an occupied bed', async () => {
    const app1 = await db.one("SELECT id FROM hostel_applications WHERE student_id = ? AND status = 'eligible'", [student.yuvaraj.id]);
    const d = await as('warden').patch(`/api/applications/${app1.id}/decision`, { decision: 'approve', remarks: 'Eligible on distance' });
    assert.equal(d.status, 200, d.body.message);
    const occupied = await db.one("SELECT b.id FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id WHERE h.code = 'A' AND b.status = 'occupied' LIMIT 1");
    const res = await as('warden').post('/api/allocations', { studentId: student.yuvaraj.id, bedId: occupied.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'BED_ALREADY_OCCUPIED');
  });

  it('refuses beds in rooms under maintenance', async () => {
    const bed = await db.one("SELECT b.id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.status = 'maintenance' LIMIT 1");
    const res = await as('warden').post('/api/allocations', { studentId: student.yuvaraj.id, bedId: bed.id });
    assert.equal(res.status, 409);
    assert.ok(['BED_UNAVAILABLE', 'ROOM_NOT_ACTIVE'].includes(res.body.code));
  });

  it('refuses a hostel that does not match the student gender', async () => {
    const bed = await availableBed('A');
    const res = await as('admin').post('/api/allocations', { studentId: student.shalini.id, bedId: bed.id });
    assert.equal(res.body.code, 'GENDER_MISMATCH');
  });

  it('lets only one of two concurrent allocations win the same bed', async () => {
    // Make a second approved student available by approving Shalini for a girls bed race.
    const bed = await availableBed('G');
    const other = await db.one("SELECT id FROM students WHERE name = 'Varsha Narayanan'");
    await db.query("INSERT INTO hostel_applications (application_code, student_id, academic_year, status) VALUES ('APPTEST1', ?, ?, 'approved')",
      [other.id, require('../src/utils/helpers').currentAcademicYear()]);
    const [r1, r2] = await Promise.all([
      as('wardenGirls').post('/api/allocations', { studentId: student.shalini.id, bedId: bed.id }),
      as('wardenGirls').post('/api/allocations', { studentId: other.id, bedId: bed.id }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const active = await db.one("SELECT COUNT(*) AS n FROM room_allocations WHERE bed_id = ? AND status = 'active'", [bed.id]);
    assert.equal(active.n, 1);
  });

  it('keeps room occupancy consistent with bed status', async () => {
    const bad = await db.query(
      `SELECT r.id FROM rooms r WHERE r.current_occupancy <> (SELECT COUNT(*) FROM beds b WHERE b.room_id = r.id AND b.status = 'occupied')
          OR r.current_occupancy > r.capacity`);
    assert.equal(bad.length, 0);
  });

  it('transfers a student, preserving the old allocation as history', async () => {
    const current = await db.one("SELECT id, bed_id FROM room_allocations WHERE student_id = ? AND status = 'active'", [student.udhayakumar.id]);
    const target = await db.one(
      `SELECT b.id FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
        WHERE h.code IN ('A','B') AND b.status = 'available' AND r.status = 'active' AND r.id <> (SELECT room_id FROM beds WHERE id = ?) LIMIT 1`, [current.bed_id]);
    const res = await as('warden').post(`/api/allocations/${current.id}/transfer`, { newBedId: target.id, reason: 'Moved closer to study hall' });
    assert.equal(res.status, 201, res.body.message);
    const old = await db.one('SELECT status FROM room_allocations WHERE id = ?', [current.id]);
    assert.equal(old.status, 'transferred');
    const oldBed = await db.one('SELECT status FROM beds WHERE id = ?', [current.bed_id]);
    assert.equal(oldBed.status, 'available');
    const hist = await db.one('SELECT COUNT(*) AS n FROM room_transfer_history WHERE from_allocation_id = ?', [current.id]);
    assert.equal(hist.n, 1);
  });
});

describe('Attendance', () => {
  const today = require('../src/utils/helpers').toDateStr();
  let hostelB; let roster;
  before(async () => {
    hostelB = (await db.one("SELECT id FROM hostels WHERE code = 'B'")).id;
    roster = (await as('warden').get(`/api/attendance/roster?hostelId=${hostelB}&date=${today}`)).body.data.students;
  });

  it('marks attendance for a hostel', async () => {
    const records = roster.map((s) => ({ studentId: s.student_id, status: 'present', checkInTime: '20:15' }));
    const res = await as('warden').post('/api/attendance', { hostelId: hostelB, date: today, records });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.saved, records.length);
  });

  it('rejects duplicate attendance for the same student and date', async () => {
    const res = await as('warden').post('/api/attendance', { hostelId: hostelB, date: today, records: [{ studentId: roster[0].student_id, status: 'absent', remarks: 'Uninformed absence' }] });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'DUPLICATE_ATTENDANCE');
  });

  it('rejects an absent mark without a reason', async () => {
    const res = await as('warden').post('/api/attendance', { hostelId: hostelB, date: today, overwrite: true, records: [{ studentId: roster[0].student_id, status: 'absent' }] });
    assert.equal(res.status, 400);
  });

  it('rejects students who are not residents of the hostel', async () => {
    const res = await as('warden').post('/api/attendance', { hostelId: hostelB, date: today, overwrite: true, records: [{ studentId: student.vishnu.id, status: 'present' }] });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_STUDENT');
  });

  it('rejects future dates', async () => {
    const res = await as('warden').post('/api/attendance', { hostelId: hostelB, date: '2099-01-01', records: [{ studentId: roster[0].student_id, status: 'present' }] });
    assert.equal(res.body.code, 'INVALID_DATE');
  });

  it('turns an absence into "on leave" when an approved leave covers the date', async () => {
    const onLeave = await db.one(
      `SELECT lr.student_id, ra.hostel_id FROM leave_requests lr JOIN room_allocations ra ON ra.student_id = lr.student_id AND ra.status = 'active'
        WHERE lr.status = 'approved' AND ? BETWEEN lr.from_date AND lr.to_date LIMIT 1`, [today]);
    const user = (await db.one('SELECT code FROM hostels WHERE id = ?', [onLeave.hostel_id])).code === 'G' ? 'wardenGirls' : 'warden';
    const res = await as(user).post('/api/attendance', { hostelId: onLeave.hostel_id, date: today, overwrite: true, records: [{ studentId: onLeave.student_id, status: 'absent', remarks: 'Not in room' }] });
    assert.equal(res.status, 200, res.body.message);
    const a = await db.one('SELECT status FROM attendance WHERE student_id = ? AND attendance_date = ?', [onLeave.student_id, today]);
    assert.equal(a.status, 'on_leave');
  });

  it('calculates the monthly percentage', async () => {
    const res = await as('arun').get(`/api/attendance/student/${student.arun.id}`);
    assert.equal(res.status, 200);
    const { present, late, absent, percentage } = res.body.data.stats;
    const expected = present + late + absent ? Math.round(((present + late) / (present + late + absent)) * 1000) / 10 : 0;
    assert.equal(percentage, expected);
  });
});

describe('Leave workflow', () => {
  const { addDays, toDateStr } = require('../src/utils/helpers');
  const base = () => ({
    leaveType: 'home', reason: 'Visiting family for festival', destination: 'Madurai', guardianContact: '9876543210', emergencyContact: '9876543211',
  });
  let leaveId;

  it('rejects an invalid date range', async () => {
    const from = addDays(toDateStr(), 10);
    const res = await as('karthik').post('/api/leaves').field({ ...base(), fromDate: from, toDate: addDays(from, -2), expectedReturnAt: `${from} 18:00` });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('accepts a valid leave request', async () => {
    const from = addDays(toDateStr(), 10);
    const res = await as('karthik').post('/api/leaves').field({ ...base(), fromDate: from, toDate: addDays(from, 2), expectedReturnAt: `${addDays(from, 2)} 18:00` });
    assert.equal(res.status, 201, res.body.message);
    leaveId = res.body.data.id;
  });

  it('rejects overlapping leave', async () => {
    const from = addDays(toDateStr(), 11);
    const res = await as('karthik').post('/api/leaves').field({ ...base(), fromDate: from, toDate: addDays(from, 1), expectedReturnAt: `${addDays(from, 1)} 18:00` });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'LEAVE_OVERLAP');
  });

  it('approves leave and notifies the student', async () => {
    const res = await as('warden').patch(`/api/leaves/${leaveId}/approve`, { remarks: 'Approved' });
    assert.equal(res.status, 200, res.body.message);
    const n = await db.one("SELECT COUNT(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ? AND n.type = 'leave_approved'", [student.karthik.email]);
    assert.ok(n.n >= 1);
  });

  it('rejects leave with a reason', async () => {
    const from = addDays(toDateStr(), 20);
    const created = await as('karthik').post('/api/leaves').field({ ...base(), fromDate: from, toDate: from, expectedReturnAt: `${from} 20:00` });
    const res = await as('warden').patch(`/api/leaves/${created.body.data.id}/reject`, { remarks: 'Exams scheduled' });
    assert.equal(res.status, 200);
    const again = await as('warden').patch(`/api/leaves/${created.body.data.id}/approve`, {});
    assert.equal(again.body.code, 'INVALID_TRANSITION');
  });

  it('detects overdue returns and resolves the exception when the student returns', async () => {
    const overdue = await db.one("SELECT id, student_id FROM leave_requests WHERE status = 'approved' AND expected_return_at < NOW() AND returned_at IS NULL LIMIT 1");
    await jobs.detectOverdueReturns();
    const exc = await db.one("SELECT status FROM attendance_exceptions WHERE student_id = ? AND exception_type = 'leave_overdue'", [overdue.student_id]);
    assert.equal(exc.status, 'open');
    const s = await db.one("SELECT h.code FROM room_allocations ra JOIN hostels h ON h.id = ra.hostel_id WHERE ra.student_id = ? AND ra.status = 'active'", [overdue.student_id]);
    const res = await as(s.code === 'G' ? 'wardenGirls' : 'warden').patch(`/api/leaves/${overdue.id}/return`, {});
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.late, true);
    const after = await db.one("SELECT status FROM attendance_exceptions WHERE student_id = ? AND exception_type = 'leave_overdue'", [overdue.student_id]);
    assert.equal(after.status, 'resolved');
  });
});

describe('Complaint lifecycle & SLA', () => {
  let id;
  it('creates a complaint with SLA and auto-assigns by skill', async () => {
    const res = await as('arun').post('/api/complaints', { category: 'electrical', priority: 'high', title: 'Switch board loose', description: 'The switch board near the bed is loose and wobbling.' });
    assert.equal(res.status, 201, res.body.message);
    id = res.body.data.id;
    assert.equal(res.body.data.slaHours, 12);
    const c = await db.one('SELECT c.status, u.staff_skill, TIMESTAMPDIFF(MINUTE, c.created_at, c.sla_due_at) AS mins FROM complaints c JOIN users u ON u.id = c.assigned_to WHERE c.id = ?', [id]);
    assert.equal(c.status, 'assigned');
    assert.equal(c.staff_skill, 'electrical');
    assert.equal(c.mins, 12 * 60);
  });

  it('blocks invalid transitions and wrong actors', async () => {
    assert.equal((await as('arun').patch(`/api/complaints/${id}/status`, { status: 'resolved', note: 'done' })).body.code, 'INVALID_TRANSITION');
    assert.equal((await as('arun').patch(`/api/complaints/${id}/status`, { status: 'in_progress', note: 'x' })).status, 403);
    assert.equal((await as('staff').patch(`/api/complaints/${id}/status`, { status: 'closed' })).body.code, 'INVALID_TRANSITION');
  });

  it('staff resolves and the student confirms with a rating', async () => {
    assert.equal((await as('staff').patch(`/api/complaints/${id}/status`, { status: 'in_progress', note: 'On it' })).status, 200);
    assert.equal((await as('staff').patch(`/api/complaints/${id}/status`, { status: 'resolved', note: 'Tightened and insulated' })).status, 200);
    const res = await as('arun').patch(`/api/complaints/${id}/status`, { status: 'closed', rating: 5, feedback: 'Quick fix' });
    assert.equal(res.status, 200, res.body.message);
    const c = await db.one('SELECT status, student_rating FROM complaints WHERE id = ?', [id]);
    assert.deepEqual([c.status, c.student_rating], ['closed', 5]);
  });

  it('escalates when the SLA is breached', async () => {
    const res = await as('arun').post('/api/complaints', { category: 'plumbing', priority: 'critical', title: 'Pipe burst in washroom', description: 'Water gushing from the pipe in the common washroom.' });
    const cid = res.body.data.id;
    await db.query('UPDATE complaints SET sla_due_at = NOW() - INTERVAL 1 HOUR WHERE id = ?', [cid]);
    await jobs.escalateComplaints();
    const c = await db.one('SELECT escalation_level FROM complaints WHERE id = ?', [cid]);
    assert.equal(c.escalation_level, 1);
    const list = await as('warden').get('/api/complaints?sla=breached');
    assert.ok(list.body.data.some((x) => x.id === cid && x.sla_breached === 1));
  });
});

describe('Fees & payments', () => {
  let fee;
  before(async () => {
    fee = await db.one(
      `SELECT sf.id, sf.total_amount - sf.discount - sf.amount_paid AS balance FROM student_fees sf
        WHERE sf.amount_paid = 0 AND sf.waived = 0 AND sf.student_id IN (SELECT student_id FROM room_allocations ra JOIN hostels h ON h.id = ra.hostel_id WHERE ra.status = 'active' AND h.code IN ('A','B'))
        ORDER BY sf.id LIMIT 1`);
  });

  it('records a partial payment', async () => {
    const res = await as('warden').post('/api/payments', { studentFeeId: fee.id, amount: 1000, paymentMode: 'upi', transactionId: 'UPITEST0001' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.data.balance, fee.balance - 1000);
  });

  it('rejects a duplicate transaction ID', async () => {
    const res = await as('warden').post('/api/payments', { studentFeeId: fee.id, amount: 500, paymentMode: 'upi', transactionId: 'UPITEST0001' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'DUPLICATE_TRANSACTION');
  });

  it('rejects overpayment', async () => {
    const res = await as('warden').post('/api/payments', { studentFeeId: fee.id, amount: fee.balance, paymentMode: 'cash', transactionId: 'CASHTEST001' });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'OVERPAYMENT');
  });

  it('records the full remaining payment and marks the fee paid', async () => {
    const res = await as('warden').post('/api/payments', { studentFeeId: fee.id, amount: fee.balance - 1000, paymentMode: 'card', transactionId: 'CARDTEST001' });
    assert.equal(res.status, 201, res.body.message);
    const row = (await as('admin').get('/api/fees?limit=500')).body.data.find((f) => f.id === fee.id);
    assert.equal(row.status, 'paid');
  });

  it('reports overdue fees', async () => {
    const res = await as('admin').get('/api/fees?status=overdue');
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((f) => f.balance > 0 && f.days_overdue > 0));
  });

  it('keeps payments immutable at the database level', async () => {
    await assert.rejects(db.query('UPDATE payments SET amount = 1 LIMIT 1'), /immutable/);
  });
});

describe('Visitors', () => {
  let entryId;
  it('checks a visitor in (with visiting-hours override)', async () => {
    const res = await as('security').post('/api/visitors', {
      name: 'Test Parent', phone: '9000000001', idProofType: 'aadhaar', idProofNumber: '123412341234', studentId: student.arun.id,
      relationship: 'Father', purpose: 'Parent visit', checkInNow: true, override: true, remarks: 'Test run',
    });
    assert.equal(res.status, 201, res.body.message);
    entryId = res.body.data.id;
  });

  it('refuses a duplicate check-in of the same visitor', async () => {
    const res = await as('security').post('/api/visitors', {
      name: 'Test Parent', phone: '9000000001', idProofType: 'aadhaar', idProofNumber: '123412341234', studentId: student.arun.id,
      relationship: 'Father', purpose: 'Second entry', checkInNow: true, override: true, remarks: 'Test run',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'VISITOR_ALREADY_INSIDE');
  });

  it('lists the visitor as currently inside, then checks out', async () => {
    const cur = await as('security').get('/api/visitors/current');
    assert.ok(cur.body.data.some((v) => v.id === entryId));
    assert.equal((await as('security').post(`/api/visitors/${entryId}/check-out`)).status, 200);
    assert.equal((await as('security').post(`/api/visitors/${entryId}/check-out`)).body.code, 'INVALID_TRANSITION');
  });
});

describe('Parent portal', () => {
  const PARENT = 'parent.711123104001@demo.college.edu';
  let children;
  before(async () => { await api.login(PARENT, 'Parent@123'); });
  const asParent = () => api.as(PARENT);

  it('lists every linked child with a summary', async () => {
    const res = await asParent().get('/api/parents/children');
    assert.equal(res.status, 200);
    children = res.body.data;
    assert.deepEqual(children.map((c) => c.name).sort(), ['Arun Kumar S', 'Harini Ramesh']);
    assert.ok(children.every((c) => 'fee_due' in c && 'attendance_pct' in c));
  });

  it('shows a child: stay, fees, payments, leave and activities', async () => {
    const res = await asParent().get(`/api/parents/children/${student.arun.id}`);
    assert.equal(res.status, 200, res.body.message);
    const d = res.body.data;
    assert.ok(d.allocation.bed_code);
    assert.ok(Array.isArray(d.fees.items) && Array.isArray(d.payments) && Array.isArray(d.leaves) && Array.isArray(d.activities));
    assert.equal(d.student.account_status, undefined);
    const att = await asParent().get(`/api/parents/children/${student.arun.id}/attendance`);
    assert.equal(att.status, 200);
    assert.ok('percentage' in att.body.data.stats);
  });

  it('cannot see a student who is not their child, or staff screens', async () => {
    assert.equal((await asParent().get(`/api/parents/children/${student.karthik.id}`)).status, 403);
    assert.equal((await asParent().get('/api/students')).status, 403);
    assert.equal((await asParent().get('/api/fees')).status, 403);
    assert.equal((await asParent().get(`/api/students/${student.arun.id}`)).status, 403);
  });

  it('is notified when the child\'s leave is approved', async () => {
    const { addDays, toDateStr } = require('../src/utils/helpers');
    const from = addDays(toDateStr(), 25);
    const lv = await as('arun').post('/api/leaves').field({ leaveType: 'home', fromDate: from, toDate: from, expectedReturnAt: `${from} 20:00`, reason: 'Family function', destination: 'Madurai', guardianContact: '9876543210', emergencyContact: '9876543211' });
    assert.equal(lv.status, 201, lv.body.message);
    assert.equal((await as('warden').patch(`/api/leaves/${lv.body.data.id}/approve`, {})).status, 200);
    const n = await asParent().get('/api/notifications');
    assert.ok(n.body.data.items.some((x) => x.type === 'leave_approved' && x.title.includes('Arun')));
  });

  it('warden links a new parent account; duplicates and out-of-scope links are refused', async () => {
    const body = { studentId: student.karthik.id, name: 'Raja M', email: 'raja.m@example.com', relation: 'Father' };
    const res = await as('warden').post('/api/parents/link', body);
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.data.created, true);
    assert.ok(res.body.data.temporaryPassword);
    assert.equal((await as('warden').post('/api/parents/link', body)).body.code, 'ALREADY_LINKED');
    assert.equal((await as('wardenGirls').post('/api/parents/link', { ...body, email: 'x@example.com' })).status, 403);
    assert.equal((await as('warden').post('/api/parents/link', { ...body, email: USERS.staff[0] })).body.code, 'EMAIL_EXISTS');
  });
});

describe('Audit trail', () => {
  it('records actions and cannot be modified', async () => {
    const n = await db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('BED_ALLOCATED','ROOM_TRANSFERRED','PAYMENT_RECORDED')");
    assert.ok(n.n >= 3);
    await assert.rejects(db.query('DELETE FROM audit_logs LIMIT 1'), /read-only/);
  });
});

describe('Mess Operations & Attendance-Based Billing', () => {
  it("fetches today's mess menu with default or overridden items", async () => {
    const res = await as('arun').get('/api/mess/menu/today');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.meals));
    assert.ok(res.body.data.meals.some((m) => m.mealType === 'breakfast'));
  });

  it('previews and confirms monthly mess bills generated from attendance', async () => {
    const prev = await as('admin').post('/api/mess/bills/preview', { billMonth: '2026-10', dailyRate: 120, userType: 'student' });
    assert.equal(prev.status, 200);
    assert.ok(Array.isArray(prev.body.data.preview));
    assert.ok(prev.body.data.preview.length > 0);

    const billSample = [prev.body.data.preview[0]];
    const conf = await as('admin').post('/api/mess/bills/confirm', { bills: billSample });
    assert.equal(conf.status, 201);
    assert.equal(conf.body.data.count, 1);
  });
});

describe('Guest Room Management (Zero-fee Policy)', () => {
  let bookingId;

  it('books a guest room with zero tariff and confirms check-in and check-out', async () => {
    const rooms = await as('admin').get('/api/guest-rooms');
    assert.equal(rooms.status, 200);
    assert.ok(rooms.body.data.length > 0);
    const roomId = rooms.body.data[0].id;

    const booking = await as('admin').post('/api/guest-rooms/bookings', {
      guestRoomId: roomId,
      guestName: 'Prof. Ramanathan',
      guestPhone: '9840123456',
      purpose: 'Anna University Academic Audit',
      checkInDate: '2026-11-25',
      checkOutDate: '2026-11-27',
    });
    assert.equal(booking.status, 201, booking.body.message);
    assert.equal(booking.body.data.feeAmount, 0, 'Guest tariff must be zero');
    bookingId = booking.body.data.id;

    const checkInRes = await as('admin').patch(`/api/guest-rooms/bookings/${bookingId}/check-in`, {});
    assert.equal(checkInRes.status, 200);
    assert.equal(checkInRes.body.data.status, 'checked_in');

    const checkOutRes = await as('admin').patch(`/api/guest-rooms/bookings/${bookingId}/check-out`, {});
    assert.equal(checkOutRes.status, 200);
    assert.equal(checkOutRes.body.data.status, 'checked_out');
  });
});
