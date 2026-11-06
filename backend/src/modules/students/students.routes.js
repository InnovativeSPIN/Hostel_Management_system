const fs = require('fs');
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notFound, forbidden, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { isAdmin, isStudent } = require('../../utils/scope');
const { upload, checkUploads } = require('../../middleware/upload');
const { studentOverview } = require('./students.service');
const { passwordSchema } = require('../auth/auth.routes');

router.use(authenticate);

const phone = z.string().trim().regex(/^[0-9+\- ]{7,20}$/, 'Invalid phone number');
const optPhone = phone.optional().nullable().or(z.literal('').transform(() => null));
const optStr = (max) => z.string().trim().max(max).optional().nullable();

const profileFields = {
  parentName: optStr(120), parentRelation: optStr(30), parentPhone: optPhone, parentEmail: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  parentOccupation: optStr(80), emergencyContactName: optStr(120), emergencyContactPhone: optPhone,
  addressLine: optStr(255), city: optStr(80), district: optStr(80), state: optStr(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().nullable().or(z.literal('').transform(() => null)),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().nullable(),
  medicalNotes: optStr(255),
};

const cbseDetailsSchema = z.object({
  classLevel: z.enum(['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12']),
  section: optStr(10),
  admissionNumber: optStr(50),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().nullable(),
  parentName: optStr(120),
  parentRelation: optStr(50),
  parentPhone: optPhone,
  parentEmail: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  parentOccupation: optStr(100),
  localGuardianName: optStr(120),
  localGuardianRelation: optStr(50),
  localGuardianPhone: optPhone,
  localGuardianAddress: optStr(255),
  emergencyContactName: optStr(120),
  emergencyContactPhone: optPhone,
  medicalConditions: optStr(500),
  allergies: optStr(500),
}).optional().nullable();

const studentBody = z.object({
  studentType: z.enum(['NSCET', 'NS-CBSE']).default('NSCET'),
  registerNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,20}$/, 'Register/admission number must be 4-20 letters/digits'),
  rollNumber: optStr(20),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone,
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  yearOfStudy: z.coerce.number().int().min(1).max(12).optional().nullable(),
  semester: z.coerce.number().int().min(1).max(12).optional().nullable(),
  section: z.string().trim().toUpperCase().max(10).optional().nullable(),
  batch: z.string().trim().optional().nullable(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  admissionQuota: z.enum(['government', 'management', 'nri', 'lateral', '7.5% Scheme', 'Sports Quota']).default('government'),
  facultyAdvisor: optStr(120),
  cgpa: z.coerce.number().min(0).max(10).optional().nullable(),
  scholarship: optStr(120),
  firstGraduate: z.coerce.boolean().default(false),
  distanceFromHomeKm: z.coerce.number().int().min(0).max(5000).optional().nullable(),
  photoUrl: optStr(255),
  cbseDetails: cbseDetailsSchema,
  ...profileFields,
}).refine((b) => {
  if (b.studentType === 'NS-CBSE') return true;
  if (!b.departmentId || !b.yearOfStudy || !b.semester || !b.batch) return false;
  return Math.ceil(b.semester / 2) === b.yearOfStudy;
}, { message: 'Semester does not match year of study or required academic fields missing', path: ['semester'] });

const profileValues = (b) => [
  b.parentName ?? null, b.parentRelation ?? null, b.parentPhone ?? null, b.parentEmail ?? null, b.parentOccupation ?? null,
  b.emergencyContactName ?? null, b.emergencyContactPhone ?? null, b.addressLine ?? null, b.city ?? null, b.district ?? null,
  b.state ?? null, b.pincode ?? null, b.bloodGroup ?? null, b.medicalNotes ?? null,
];

async function upsertCbseDetails(conn, studentId, details) {
  if (!details) return;
  const cols = [
    'student_id', 'class_level', 'section', 'admission_number', 'date_of_birth',
    'blood_group', 'parent_name', 'parent_relation', 'parent_phone', 'parent_email',
    'parent_occupation', 'local_guardian_name', 'local_guardian_relation',
    'local_guardian_phone', 'local_guardian_address', 'emergency_contact_name',
    'emergency_contact_phone', 'medical_conditions', 'allergies'
  ];
  const vals = [
    studentId,
    details.classLevel,
    details.section || null,
    details.admissionNumber || null,
    details.dateOfBirth || null,
    details.bloodGroup || null,
    details.parentName || null,
    details.parentRelation || null,
    details.parentPhone || null,
    details.parentEmail || null,
    details.parentOccupation || null,
    details.localGuardianName || null,
    details.localGuardianRelation || null,
    details.localGuardianPhone || null,
    details.localGuardianAddress || null,
    details.emergencyContactName || null,
    details.emergencyContactPhone || null,
    details.medicalConditions || null,
    details.allergies || null
  ];
  const updateCols = cols.slice(1).map((c) => `${c} = VALUES(${c})`).join(', ');
  await conn.query(
    `INSERT INTO student_cbse_details (${cols.join(', ')})
     VALUES (${cols.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updateCols}`,
    vals
  );
}

// Wardens/staff see residents of their hostels plus students not yet allocated (needed for admissions).
function scopeStudents(where, user) {
  if (isAdmin(user)) return;
  where.add(`(ra.hostel_id IN (?) OR ra.id IS NULL)`, user.hostelIds.length ? user.hostelIds : [0]);
}

async function assertStudentAccess(user, studentId) {
  if (isAdmin(user)) return;
  if (isStudent(user)) {
    if (user.studentId !== Number(studentId)) throw forbidden('You can only view your own record');
    return;
  }
  const row = await db.one("SELECT hostel_id FROM room_allocations WHERE student_id = ? AND status = 'active'", [studentId]);
  if (row && !user.hostelIds.includes(row.hostel_id)) throw forbidden('This student belongs to a hostel outside your scope');
}

/**
 * GET /api/students
 * Filters: search (name/register/email/phone), studentType, departmentId, year, hostelId, room, hostelStatus, gender, batch
 */
router.get('/', authorize('students.view'), async (req, res) => {
  const q = parseList(req.query, {
    sortable: { name: 's.name', register: 's.register_number', department: 'd.short_name', year: 's.year_of_study', room: 'h.code, r.room_number', created: 's.created_at' },
    defaultSort: 'name',
    defaultOrder: 'asc',
  });
  const where = new Where().add('s.deleted_at IS NULL')
    .search(q.search, ['s.name', 's.register_number', 's.email', 's.phone', 's.roll_number', 'scd.admission_number'])
    .addIf(q.studentType, 's.student_type = ?', q.studentType)
    .addIf(q.departmentId, 's.department_id = ?', q.departmentId)
    .addIf(q.year, 's.year_of_study = ?', q.year)
    .addIf(q.hostelId, 'ra.hostel_id = ?', q.hostelId)
    .addIf(q.room, 'r.room_number = ?', q.room)
    .addIf(q.hostelStatus, 's.hostel_status = ?', q.hostelStatus)
    .addIf(q.gender, 's.gender = ?', q.gender)
    .addIf(q.batch, 's.batch = ?', q.batch);
  scopeStudents(where, req.user);
  paged(res, await paginate(db, {
    select: `s.id, s.register_number, s.name, s.email, s.phone, s.gender, s.year_of_study, s.semester, s.section, s.batch, s.hostel_status, s.admission_quota, s.photo_url, s.student_type,
             scd.class_level AS cbse_class_level, scd.section AS cbse_section, scd.admission_number AS cbse_admission_number,
             d.id AS department_id, d.short_name AS department, d.code AS department_code,
             h.id AS hostel_id, h.code AS hostel_code, h.name AS hostel_name, r.room_number, b.bed_code`,
    from: `FROM students s JOIN departments d ON d.id = s.department_id
           LEFT JOIN student_cbse_details scd ON scd.student_id = s.id
           LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
           LEFT JOIN beds b ON b.id = ra.bed_id LEFT JOIN rooms r ON r.id = ra.room_id LEFT JOIN hostels h ON h.id = ra.hostel_id`,
    where, ...q,
  }));
});

/** GET /api/students/lookup?search&hostelStatus minimal fields for pickers (gate staff included) */
router.get('/lookup', authorize('students.view', 'visitors.manage', 'exits.manage'), async (req, res) => {
  const where = new Where().add('s.deleted_at IS NULL')
    .search(String(req.query.search || '').slice(0, 60), ['s.name', 's.register_number', 'scd.admission_number'])
    .addIf(req.query.studentType, 's.student_type = ?', req.query.studentType)
    .addIf(req.query.hostelStatus, 's.hostel_status = ?', req.query.hostelStatus);
  scopeStudents(where, req.user);
  ok(res, await db.query(
    `SELECT s.id, s.name, s.register_number, s.photo_url, s.student_type, s.year_of_study, s.gender,
            scd.class_level AS cbse_class_level, scd.section AS cbse_section,
            d.short_name AS department, h.code AS hostel_code, r.room_number, b.bed_code
       FROM students s JOIN departments d ON d.id = s.department_id
       LEFT JOIN student_cbse_details scd ON scd.student_id = s.id
       LEFT JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
       LEFT JOIN beds b ON b.id = ra.bed_id LEFT JOIN rooms r ON r.id = ra.room_id LEFT JOIN hostels h ON h.id = ra.hostel_id
       ${where.sql} ORDER BY s.name LIMIT 30`, where.params));
});

/** GET /api/students/me student's own 360 overview */
router.get('/me', async (req, res) => {
  if (!req.user.studentId) throw notFound('Student record');
  ok(res, await studentOverview(req.user.studentId));
});

/** PUT /api/students/me/profile students may only edit contact / guardian / medical details */
router.put('/me/profile', validate(z.object({ phone: phone.optional(), ...profileFields })), async (req, res) => {
  if (!req.user.studentId) throw notFound('Student record');
  const b = req.body;
  const before = await db.one('SELECT * FROM student_profiles WHERE student_id = ?', [req.user.studentId]);
  await db.transaction(async (conn) => {
    if (b.phone) {
      await conn.query('UPDATE students SET phone = ? WHERE id = ?', [b.phone, req.user.studentId]);
      await conn.query('UPDATE users SET phone = ? WHERE id = ?', [b.phone, req.user.id]);
    }
    await upsertProfile(conn, req.user.studentId, b, before);
    await audit(req, { action: 'PROFILE_UPDATED', module: 'students', recordId: req.user.studentId, summary: 'Student updated own contact details', oldValue: before, newValue: b }, conn);
  });
  ok(res, { id: req.user.studentId });
});

async function upsertProfile(conn, studentId, b, before) {
  const merged = { ...b };
  // Keep existing values for fields the caller did not send.
  const keys = ['parentName', 'parentRelation', 'parentPhone', 'parentEmail', 'parentOccupation', 'emergencyContactName', 'emergencyContactPhone',
    'addressLine', 'city', 'district', 'state', 'pincode', 'bloodGroup', 'medicalNotes'];
  const cols = ['parent_name', 'parent_relation', 'parent_phone', 'parent_email', 'parent_occupation', 'emergency_contact_name', 'emergency_contact_phone',
    'address_line', 'city', 'district', 'state', 'pincode', 'blood_group', 'medical_notes'];
  keys.forEach((k, i) => { if (merged[k] === undefined && before) merged[k] = before[cols[i]]; });
  const vals = profileValues(merged);
  await conn.query(
    `INSERT INTO student_profiles (student_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(', ')}`, [studentId, ...vals]);
}

/** GET /api/students/:id full 360 view (profile, room, fees, attendance, leave, complaints, history, cbse) */
router.get('/:id', async (req, res) => {
  if (!isStudent(req.user) && !req.user.permissions.has('students.view')) throw forbidden();
  await assertStudentAccess(req.user, req.params.id);
  const data = await studentOverview(Number(req.params.id));
  if (!data) throw notFound('Student');
  ok(res, data);
});

/** POST /api/students creates login account + student record + profile + optional CBSE details */
router.post('/', authorize('students.manage'), validate(studentBody.and(z.object({ password: passwordSchema.optional() }))), async (req, res) => {
  const b = req.body;
  const tempPassword = b.password || `Hostel@${b.registerNumber.slice(-4)}`;
  const hash = await bcrypt.hash(tempPassword, 10);
  const id = await db.transaction(async (conn) => {
    let departmentId = b.departmentId;
    if (b.studentType === 'NS-CBSE' && !departmentId) {
      const cbseDept = await conn.query("SELECT id FROM departments WHERE code = 'CBSE' LIMIT 1");
      departmentId = cbseDept[0]?.[0]?.id || 1;
    }
    const yearOfStudy = b.studentType === 'NS-CBSE' ? 1 : b.yearOfStudy;
    const semester = b.studentType === 'NS-CBSE' ? 1 : b.semester;
    const batch = b.batch || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const dob = b.dateOfBirth || b.cbseDetails?.dateOfBirth || null;
    const section = b.section || b.cbseDetails?.section || null;

    const [u] = await conn.query(
      "INSERT INTO users (role_id, name, email, phone, password_hash) VALUES ((SELECT id FROM roles WHERE name = 'student'),?,?,?,?)",
      [b.name, b.email, b.phone, hash]);
    const [s] = await conn.query(
      `INSERT INTO students (user_id, register_number, roll_number, name, email, phone, gender, date_of_birth, department_id, year_of_study,
                             semester, section, batch, admission_date, admission_quota, student_type, photo_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [u.insertId, b.registerNumber, b.rollNumber || null, b.name, b.email, b.phone, b.gender, dob, departmentId,
        yearOfStudy, semester, section, batch, b.admissionDate || null, b.admissionQuota, b.studentType || 'NSCET', b.photoUrl || null]);

    const profileData = {
      ...b,
      parentName: b.parentName || b.cbseDetails?.parentName,
      parentRelation: b.parentRelation || b.cbseDetails?.parentRelation,
      parentPhone: b.parentPhone || b.cbseDetails?.parentPhone,
      parentEmail: b.parentEmail || b.cbseDetails?.parentEmail,
      parentOccupation: b.parentOccupation || b.cbseDetails?.parentOccupation,
      emergencyContactName: b.emergencyContactName || b.cbseDetails?.emergencyContactName,
      emergencyContactPhone: b.emergencyContactPhone || b.cbseDetails?.emergencyContactPhone,
      bloodGroup: b.bloodGroup || b.cbseDetails?.bloodGroup,
      medicalNotes: b.medicalNotes || b.cbseDetails?.medicalConditions,
    };
    await upsertProfile(conn, s.insertId, profileData, null);
    await conn.query(
      'UPDATE student_profiles SET faculty_advisor = ?, cgpa = ?, scholarship = ?, first_graduate = ?, distance_from_home_km = ? WHERE student_id = ?',
      [b.facultyAdvisor || null, b.cgpa ?? null, b.scholarship || null, b.firstGraduate ? 1 : 0, b.distanceFromHomeKm ?? null, s.insertId]);

    if (b.studentType === 'NS-CBSE' && b.cbseDetails) {
      await upsertCbseDetails(conn, s.insertId, b.cbseDetails);
    }

    await audit(req, { action: 'STUDENT_CREATED', module: 'students', recordId: s.insertId, summary: `Created student ${b.registerNumber} - ${b.name} (${b.studentType || 'NSCET'})`, newValue: { ...b, password: undefined } }, conn);
    return s.insertId;
  });
  created(res, { id, temporaryPassword: b.password ? undefined : tempPassword });
});

/** PUT /api/students/:id administrative update (academic + contact + guardian details + CBSE details) */
router.put('/:id', authorize('students.manage'), validate(studentBody), async (req, res) => {
  const id = Number(req.params.id);
  await assertStudentAccess(req.user, id);
  const before = await db.one('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!before) throw notFound('Student');
  const b = req.body;
  if (b.gender !== before.gender && before.hostel_status === 'resident') {
    throw conflict('Gender cannot be changed while the student holds a hostel allocation', 'STUDENT_ALLOCATED');
  }

  let departmentId = b.departmentId || before.department_id;
  if (b.studentType === 'NS-CBSE' && !b.departmentId) {
    const cbseDept = await db.one("SELECT id FROM departments WHERE code = 'CBSE' LIMIT 1");
    if (cbseDept) departmentId = cbseDept.id;
  }
  const yearOfStudy = b.yearOfStudy || before.year_of_study;
  const semester = b.semester || before.semester;
  const batch = b.batch || before.batch;
  const dob = b.dateOfBirth || b.cbseDetails?.dateOfBirth || before.date_of_birth;
  const section = b.section || b.cbseDetails?.section || before.section;

  const profileBefore = await db.one('SELECT * FROM student_profiles WHERE student_id = ?', [id]);
  await db.transaction(async (conn) => {
    await conn.query(
      `UPDATE students SET register_number=?, roll_number=?, name=?, email=?, phone=?, gender=?, date_of_birth=?, department_id=?,
              year_of_study=?, semester=?, section=?, batch=?, admission_date=?, admission_quota=?, student_type=?, photo_url=COALESCE(?, photo_url) WHERE id=?`,
      [b.registerNumber, b.rollNumber || null, b.name, b.email, b.phone, b.gender, dob, departmentId,
        yearOfStudy, semester, section, batch, b.admissionDate || null, b.admissionQuota, b.studentType || before.student_type, b.photoUrl ?? null, id]);
    await conn.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [b.name, b.email, b.phone, before.user_id]);

    const profileData = {
      ...b,
      parentName: b.parentName || b.cbseDetails?.parentName,
      parentRelation: b.parentRelation || b.cbseDetails?.parentRelation,
      parentPhone: b.parentPhone || b.cbseDetails?.parentPhone,
      parentEmail: b.parentEmail || b.cbseDetails?.parentEmail,
      parentOccupation: b.parentOccupation || b.cbseDetails?.parentOccupation,
      emergencyContactName: b.emergencyContactName || b.cbseDetails?.emergencyContactName,
      emergencyContactPhone: b.emergencyContactPhone || b.cbseDetails?.emergencyContactPhone,
      bloodGroup: b.bloodGroup || b.cbseDetails?.bloodGroup,
      medicalNotes: b.medicalNotes || b.cbseDetails?.medicalConditions,
    };
    await upsertProfile(conn, id, profileData, profileBefore);
    await conn.query(
      'UPDATE student_profiles SET faculty_advisor = ?, cgpa = ?, scholarship = ?, first_graduate = ?, distance_from_home_km = ? WHERE student_id = ?',
      [b.facultyAdvisor || null, b.cgpa ?? null, b.scholarship || null, b.firstGraduate ? 1 : 0, b.distanceFromHomeKm ?? null, id]);

    if (b.studentType === 'NS-CBSE' && b.cbseDetails) {
      await upsertCbseDetails(conn, id, b.cbseDetails);
    }

    await audit(req, { action: 'STUDENT_UPDATED', module: 'students', recordId: id, summary: `Updated student ${b.registerNumber} (${b.studentType || before.student_type})`, oldValue: { ...before, profile: profileBefore }, newValue: b }, conn);
  });
  ok(res, { id });
});

/**
 * POST /api/students/:id/photo
 * Upload or update student photo (JPEG/PNG, max upload size).
 */
router.post('/:id/photo', upload.single('photo'), checkUploads, async (req, res) => {
  const id = Number(req.params.id);
  await assertStudentAccess(req.user, id);
  const s = await db.one('SELECT id, user_id, photo_url FROM students WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!s) throw notFound('Student');
  if (!req.file) throw badRequest('Please upload an image file', 'FILE_REQUIRED');
  if (!['image/jpeg', 'image/png'].includes(req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    throw badRequest('Only JPG and PNG images are allowed', 'INVALID_FILE_TYPE');
  }

  const photoUrl = `/uploads/${req.file.filename}`;
  await db.query('UPDATE students SET photo_url = ? WHERE id = ?', [photoUrl, id]);
  await audit(req, {
    action: 'STUDENT_PHOTO_UPDATED',
    module: 'students',
    recordId: id,
    summary: `Updated photo for student #${id}`,
    oldValue: { photoUrl: s.photo_url },
    newValue: { photoUrl },
  });

  ok(res, { id, photoUrl });
});

/** DELETE /api/students/:id/photo */
router.delete('/:id/photo', async (req, res) => {
  const id = Number(req.params.id);
  await assertStudentAccess(req.user, id);
  const s = await db.one('SELECT id, photo_url FROM students WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!s) throw notFound('Student');
  await db.query('UPDATE students SET photo_url = NULL WHERE id = ?', [id]);
  await audit(req, {
    action: 'STUDENT_PHOTO_REMOVED',
    module: 'students',
    recordId: id,
    summary: `Removed photo for student #${id}`,
  });
  ok(res, { id, photoUrl: null });
});

/**
 * PATCH /api/students/:id/status  { hostelStatus?, accountStatus?, reason }
 * Workflow-owned states (resident / exited) can only be reached through allocation and exit clearance.
 */
router.patch('/:id/status', authorize('students.manage'),
  validate(z.object({
    hostelStatus: z.enum(['not_applied', 'rejected']).optional(),
    accountStatus: z.enum(['active', 'inactive']).optional(),
    reason: z.string().trim().min(3).max(255),
  }).refine((b) => b.hostelStatus || b.accountStatus, 'Provide hostelStatus or accountStatus')),
  async (req, res) => {
    const id = Number(req.params.id);
    await assertStudentAccess(req.user, id);
    const s = await db.one('SELECT id, user_id, hostel_status, register_number FROM students WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!s) throw notFound('Student');
    if (req.body.hostelStatus && s.hostel_status === 'resident') {
      throw conflict('Student is a current resident. Use the hostel exit workflow to release the bed.', 'STUDENT_ALLOCATED');
    }
    await db.transaction(async (conn) => {
      if (req.body.hostelStatus) await conn.query('UPDATE students SET hostel_status = ? WHERE id = ?', [req.body.hostelStatus, id]);
      if (req.body.accountStatus) await conn.query('UPDATE users SET status = ?, token_version = token_version + 1 WHERE id = ?', [req.body.accountStatus, s.user_id]);
      await audit(req, { action: 'STUDENT_STATUS_CHANGED', module: 'students', recordId: id, summary: `${s.register_number}: ${req.body.reason}`, oldValue: { hostelStatus: s.hostel_status }, newValue: req.body }, conn);
    });
    ok(res, { id });
  });

module.exports = router;
