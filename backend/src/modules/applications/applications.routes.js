const router = require('express').Router();
const fs = require('fs');
const { z } = require('zod');
const db = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { upload, checkUploads, sendUpload } = require('../../middleware/upload');
const { notFound, forbidden, conflict, badRequest } = require('../../utils/AppError');
const { ok, created, paged } = require('../../utils/respond');
const { parseList, Where, paginate } = require('../../utils/list');
const { audit } = require('../../services/audit');
const { notify, hostelWardenIds } = require('../../services/notify');
const { isAdmin, isStudent } = require('../../utils/scope');
const { currentAcademicYear, tempCode, assignCode, toDateTimeStr } = require('../../utils/helpers');
const { FEE_STATUS_SQL } = require('../fees/fees.service');

router.use(authenticate);

const DOC_TYPES = ['id_proof', 'admission_letter', 'address_proof', 'photo', 'medical_certificate', 'income_certificate', 'other'];
const REQUIRED_DOCS = ['id_proof', 'admission_letter'];

// Allowed forward transitions of the admission workflow.
const TRANSITIONS = {
  submitted: ['documents_verified', 'rejected', 'cancelled'],
  documents_verified: ['eligible', 'rejected', 'cancelled'],
  eligible: ['approved', 'rejected', 'cancelled'],
  approved: ['fee_assigned', 'allocated', 'cancelled'],
  fee_assigned: ['allocated', 'cancelled'],
  allocated: ['confirmed'],
  confirmed: [],
  rejected: [],
  cancelled: [],
};

async function loadApp(id, conn) {
  const app = await db.one(
    `SELECT a.*, s.name AS student_name, s.user_id, s.gender, s.register_number, s.year_of_study, s.hostel_status,
            h.gender AS preferred_gender, h.name AS preferred_hostel
       FROM hostel_applications a JOIN students s ON s.id = a.student_id LEFT JOIN hostels h ON h.id = a.preferred_hostel_id
      WHERE a.id = ? ${conn ? 'FOR UPDATE' : ''}`, [id], conn || db.pool);
  if (!app) throw notFound('Application');
  return app;
}

function assertAccess(user, app) {
  if (isStudent(user)) {
    if (app.student_id !== user.studentId) throw forbidden('You can only access your own application');
    return;
  }
  if (!isAdmin(user) && app.preferred_hostel_id && !user.hostelIds.includes(app.preferred_hostel_id)) {
    throw forbidden('This application is for a hostel outside your scope');
  }
}

async function transition(conn, req, app, to, remarks, extra = {}) {
  if (!TRANSITIONS[app.status].includes(to)) {
    throw conflict(`Cannot move application from "${app.status}" to "${to}"`, 'INVALID_TRANSITION');
  }
  const sets = ['status = ?'];
  const vals = [to];
  Object.entries(extra).forEach(([k, v]) => { sets.push(`${k} = ?`); vals.push(v); });
  await conn.query(`UPDATE hostel_applications SET ${sets.join(', ')} WHERE id = ?`, [...vals, app.id]);
  await conn.query('INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks) VALUES (?,?,?,?,?)',
    [app.id, app.status, to, req.user.id, remarks || null]);
  await audit(req, { action: 'APPLICATION_STATUS', module: 'applications', recordId: app.id, summary: `${app.application_code}: ${app.status} → ${to}${remarks ? ` (${remarks})` : ''}`, oldValue: { status: app.status }, newValue: { status: to, remarks } }, conn);
}

// Automated eligibility checks shown to the warden (the decision stays with the warden).
async function eligibility(app) {
  const docs = await db.query('SELECT doc_type, verified FROM application_documents WHERE application_id = ?', [app.id]);
  const overdue = await db.one(
    `SELECT COUNT(*) AS n FROM student_fees sf WHERE sf.student_id = ? AND ${FEE_STATUS_SQL} = 'overdue'`, [app.student_id]);
  const active = await db.one("SELECT COUNT(*) AS n FROM room_allocations WHERE student_id = ? AND status = 'active'", [app.student_id]);
  const genderOk = !app.preferred_gender || app.preferred_gender === 'co-ed' || app.preferred_gender === app.gender;
  return [
    { key: 'documents', label: 'Required documents uploaded', passed: REQUIRED_DOCS.every((t) => docs.some((d) => d.doc_type === t)), detail: `Required: ${REQUIRED_DOCS.join(', ')}` },
    { key: 'verified', label: 'All documents verified', passed: docs.length > 0 && docs.every((d) => d.verified) },
    { key: 'gender', label: 'Preferred hostel matches student gender', passed: genderOk },
    { key: 'dues', label: 'No overdue hostel fees', passed: overdue.n === 0 },
    { key: 'allocation', label: 'No current bed allocation', passed: active.n === 0 },
  ];
}

const docsField = upload.fields(DOC_TYPES.map((t) => ({ name: t, maxCount: 1 })));

async function saveDocs(conn, appId, files) {
  const rows = [];
  for (const [type, list] of Object.entries(files || {})) {
    for (const f of list) rows.push([appId, type, f.originalname.slice(0, 255), f.filename, f.mimetype, f.size]);
  }
  if (rows.length) await conn.query('INSERT INTO application_documents (application_id, doc_type, original_name, stored_name, mime_type, size_bytes) VALUES ?', [rows]);
  return rows.length;
}

const cleanupFiles = (files) => Object.values(files || {}).flat().forEach((f) => fs.unlink(f.path, () => {}));

/**
 * POST /api/applications  (multipart/form-data)
 * Fields: academicYear?, preferredHostelId?, preferredRoomType?, needsAc?, reason, studentId (staff only)
 * Files: id_proof, admission_letter, address_proof, photo, medical_certificate, income_certificate, other (PDF/JPG/PNG)
 */
router.post('/', authorize('applications.apply', 'applications.review'), docsField, checkUploads, async (req, res) => {
  try {
    const b = z.object({
      studentId: z.coerce.number().int().positive().optional(),
      academicYear: z.string().regex(/^\d{4}-\d{2}$/).default(currentAcademicYear()),
      preferredHostelId: z.coerce.number().int().positive().optional().nullable(),
      preferredRoomType: z.enum(['single', 'double', 'triple', 'quad', 'dormitory']).optional().nullable(),
      studentType: z.enum(['nscet', 'ns_cbse']).default('nscet'),
      admissionQuota: z.enum(['government', 'management', 'nri', 'lateral', '7_point_5_scheme', 'sports_quota']).default('government'),
      needsAc: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
      reason: z.string().trim().min(10, 'Please describe why you need hostel accommodation').max(500),
    }).parse(req.body);

    const studentId = isStudent(req.user) ? req.user.studentId : b.studentId;
    if (!studentId) throw badRequest('studentId is required', 'STUDENT_REQUIRED');
    const student = await db.one('SELECT id, name, gender, hostel_status FROM students WHERE id = ? AND deleted_at IS NULL', [studentId]);
    if (!student) throw notFound('Student');
    if (student.hostel_status === 'resident') throw conflict('Student already has a hostel allocation', 'STUDENT_ALREADY_ALLOCATED');
    if (b.preferredHostelId) {
      const h = await db.one("SELECT id, gender, status FROM hostels WHERE id = ? AND deleted_at IS NULL", [b.preferredHostelId]);
      if (!h || h.status !== 'active') throw badRequest('Preferred hostel is not accepting students', 'HOSTEL_UNAVAILABLE');
      if (h.gender !== 'co-ed' && h.gender !== student.gender) throw badRequest('Preferred hostel is not available for your gender', 'GENDER_MISMATCH');
    }

    const result = await db.transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO hostel_applications (application_code, student_id, academic_year, preferred_hostel_id, preferred_room_type, student_type, admission_quota, needs_ac, reason)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [tempCode(), studentId, b.academicYear, b.preferredHostelId || null, b.preferredRoomType || null, b.studentType, b.admissionQuota, b.needsAc ? 1 : 0, b.reason]);
      const code = await assignCode(conn, 'hostel_applications', 'application_code', 'APP', r.insertId);
      const docCount = await saveDocs(conn, r.insertId, req.files);
      await conn.query("INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks) VALUES (?,NULL,'submitted',?,?)",
        [r.insertId, req.user.id, `Submitted with ${docCount} document(s)`]);
      await conn.query("UPDATE students SET hostel_status = 'applied' WHERE id = ?", [studentId]);
      if (b.preferredHostelId) {
        await notify(await hostelWardenIds(b.preferredHostelId, conn), {
          type: 'application_submitted', title: 'New hostel application', message: `${student.name} submitted ${code}.`, link: `/applications/${r.insertId}`,
        }, conn);
      }
      await audit(req, { action: 'APPLICATION_SUBMITTED', module: 'applications', recordId: r.insertId, summary: `${code} submitted for ${student.name}`, newValue: b }, conn);
      return { id: r.insertId, applicationCode: code };
    });
    created(res, result);
  } catch (err) {
    cleanupFiles(req.files);
    throw err;
  }
});

/** GET /api/applications  ?status&hostelId&departmentId&year&search */
router.get('/', authorize('applications.apply', 'applications.review'), async (req, res) => {
  const q = parseList(req.query, { sortable: { created: 'a.created_at', status: 'a.status', student: 's.name' }, defaultSort: 'created' });
  const where = new Where()
    .search(q.search, ['s.name', 's.register_number', 'a.application_code'])
    .addIf(q.status, 'a.status = ?', q.status)
    .addIf(q.hostelId, 'a.preferred_hostel_id = ?', q.hostelId)
    .addIf(q.departmentId, 's.department_id = ?', q.departmentId)
    .addIf(q.year, 's.year_of_study = ?', q.year)
    .addIf(q.academicYear, 'a.academic_year = ?', q.academicYear);
  if (isStudent(req.user)) where.add('a.student_id = ?', req.user.studentId || 0);
  else if (!isAdmin(req.user)) where.add('(a.preferred_hostel_id IN (?) OR a.preferred_hostel_id IS NULL)', req.user.hostelIds.length ? req.user.hostelIds : [0]);
  if (q.open === 'true') where.add("a.status IN ('submitted','documents_verified','eligible','approved','fee_assigned','allocated')");
  paged(res, await paginate(db, {
    select: `a.id, a.application_code, a.academic_year, a.status, a.preferred_room_type, a.needs_ac, a.created_at, a.reviewed_at,
             s.id AS student_id, s.name AS student_name, s.register_number, s.gender, s.year_of_study, d.short_name AS department,
             h.name AS preferred_hostel, (SELECT COUNT(*) FROM application_documents ad WHERE ad.application_id = a.id) AS documents,
             p.distance_from_home_km`,
    from: `FROM hostel_applications a JOIN students s ON s.id = a.student_id JOIN departments d ON d.id = s.department_id
           LEFT JOIN hostels h ON h.id = a.preferred_hostel_id LEFT JOIN student_profiles p ON p.student_id = s.id`,
    where, ...q,
  }));
});

/** GET /api/applications/:id  with documents, status history and eligibility checks */
router.get('/:id', authorize('applications.apply', 'applications.review'), async (req, res) => {
  const app = await loadApp(req.params.id);
  assertAccess(req.user, app);
  const [documents, history, student] = await Promise.all([
    db.query(
      `SELECT ad.id, ad.doc_type, ad.original_name, ad.mime_type, ad.size_bytes, ad.verified, ad.verified_at, u.name AS verified_by, ad.created_at
         FROM application_documents ad LEFT JOIN users u ON u.id = ad.verified_by WHERE ad.application_id = ?`, [app.id]),
    db.query(
      `SELECT h.from_status, h.to_status, h.remarks, h.created_at, u.name AS changed_by
         FROM application_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.application_id = ? ORDER BY h.id`, [app.id]),
    db.one(
      `SELECT s.id, s.name, s.register_number, s.email, s.phone, s.gender, s.year_of_study, s.batch, d.name AS department,
              p.parent_name, p.parent_phone, p.city, p.district, p.distance_from_home_km
         FROM students s JOIN departments d ON d.id = s.department_id LEFT JOIN student_profiles p ON p.student_id = s.id WHERE s.id = ?`, [app.student_id]),
  ]);
  ok(res, { ...app, student, documents, history, eligibility: await eligibility(app), allowedTransitions: TRANSITIONS[app.status] });
});

/** POST /api/applications/:id/documents  upload additional documents (before approval) */
router.post('/:id/documents', authorize('applications.apply', 'applications.review'), docsField, checkUploads, async (req, res) => {
  try {
    const app = await loadApp(req.params.id);
    assertAccess(req.user, app);
    if (!['submitted', 'documents_verified'].includes(app.status)) throw conflict('Documents can only be added before eligibility review', 'APPLICATION_LOCKED');
    const n = await db.transaction(async (conn) => {
      const count = await saveDocs(conn, app.id, req.files);
      if (app.status === 'documents_verified') await transitionBack(conn, req, app);
      return count;
    });
    if (!n) throw badRequest('No files received', 'NO_FILES');
    created(res, { uploaded: n });
  } catch (err) {
    cleanupFiles(req.files);
    throw err;
  }
});

// New documents after verification send the application back for re-verification.
async function transitionBack(conn, req, app) {
  await conn.query("UPDATE hostel_applications SET status = 'submitted' WHERE id = ?", [app.id]);
  await conn.query("INSERT INTO application_status_history (application_id, from_status, to_status, changed_by, remarks) VALUES (?,?,?,?,?)",
    [app.id, app.status, 'submitted', req.user.id, 'New documents uploaded; re-verification required']);
}

/** GET /api/applications/documents/:docId/download */
router.get('/documents/:docId/download', authorize('applications.apply', 'applications.review'), async (req, res) => {
  const doc = await db.one('SELECT * FROM application_documents WHERE id = ?', [req.params.docId]);
  if (!doc) throw notFound('Document');
  assertAccess(req.user, await loadApp(doc.application_id));
  sendUpload(res, doc.stored_name, doc.original_name);
});

/** PATCH /api/applications/:id/verify-documents  { documentIds?: number[], remarks } verifies documents; all verified -> documents_verified */
router.patch('/:id/verify-documents', authorize('applications.review'),
  validate(z.object({ documentIds: z.array(z.number().int().positive()).optional(), remarks: z.string().trim().max(500).optional() })),
  async (req, res) => {
    const out = await db.transaction(async (conn) => {
      const app = await loadApp(req.params.id, conn);
      assertAccess(req.user, app);
      if (app.status !== 'submitted') throw conflict('Documents are verified only for submitted applications', 'INVALID_TRANSITION');
      const docs = await db.query('SELECT id, doc_type FROM application_documents WHERE application_id = ?', [app.id], conn);
      const missing = REQUIRED_DOCS.filter((t) => !docs.some((d) => d.doc_type === t));
      if (missing.length) throw conflict(`Missing required documents: ${missing.join(', ')}`, 'DOCUMENTS_MISSING');
      const ids = req.body.documentIds?.length ? req.body.documentIds : docs.map((d) => d.id);
      await conn.query('UPDATE application_documents SET verified = 1, verified_by = ?, verified_at = NOW() WHERE application_id = ? AND id IN (?)', [req.user.id, app.id, ids]);
      const pending = await db.one('SELECT COUNT(*) AS n FROM application_documents WHERE application_id = ? AND verified = 0', [app.id], conn);
      if (pending.n === 0) await transition(conn, req, app, 'documents_verified', req.body.remarks || 'All documents verified');
      return { verified: ids.length, pending: pending.n };
    });
    ok(res, out);
  });

/** PATCH /api/applications/:id/eligibility  { eligible: boolean, notes } */
router.patch('/:id/eligibility', authorize('applications.review'),
  validate(z.object({ eligible: z.boolean(), notes: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const app = await loadApp(req.params.id, conn);
      assertAccess(req.user, app);
      const to = req.body.eligible ? 'eligible' : 'rejected';
      await transition(conn, req, app, to, req.body.notes, { eligibility_notes: req.body.notes, reviewed_by: req.user.id, reviewed_at: toDateTimeStr() });
      if (!req.body.eligible) {
        await conn.query("UPDATE students SET hostel_status = 'rejected' WHERE id = ?", [app.student_id]);
        await notify(app.user_id, { type: 'admission_rejected', title: 'Hostel application not eligible', message: `${app.application_code}: ${req.body.notes}`, link: '/my/application' }, conn);
      }
    });
    ok(res, { id: Number(req.params.id) });
  });

/** PATCH /api/applications/:id/decision  { decision: approve|reject, remarks } */
router.patch('/:id/decision', authorize('applications.review'),
  validate(z.object({ decision: z.enum(['approve', 'reject']), remarks: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    await db.transaction(async (conn) => {
      const app = await loadApp(req.params.id, conn);
      assertAccess(req.user, app);
      const approve = req.body.decision === 'approve';
      await transition(conn, req, app, approve ? 'approved' : 'rejected', req.body.remarks, { remarks: req.body.remarks, reviewed_by: req.user.id, reviewed_at: toDateTimeStr() });
      await conn.query('UPDATE students SET hostel_status = ? WHERE id = ?', [approve ? 'approved' : 'rejected', app.student_id]);
      await notify(app.user_id, {
        type: approve ? 'admission_approved' : 'admission_rejected',
        title: approve ? 'Hostel admission approved' : 'Hostel admission rejected',
        message: approve ? `${app.application_code} approved. Fee details and room allocation will follow.` : `${app.application_code} was rejected: ${req.body.remarks}`,
        link: '/my/application',
      }, conn);
    });
    ok(res, { id: Number(req.params.id) });
  });

/** PATCH /api/applications/:id/confirm  admission confirmation after allocation */
router.patch('/:id/confirm', authorize('applications.review'), validate(z.object({ remarks: z.string().trim().max(500).optional() })), async (req, res) => {
  await db.transaction(async (conn) => {
    const app = await loadApp(req.params.id, conn);
    assertAccess(req.user, app);
    await transition(conn, req, app, 'confirmed', req.body.remarks || 'Admission confirmed');
    await notify(app.user_id, { type: 'admission_confirmed', title: 'Hostel admission confirmed', message: `${app.application_code} is confirmed. Welcome to the hostel!`, link: '/my/hostel' }, conn);
  });
  ok(res, { id: Number(req.params.id) });
});

/** PATCH /api/applications/:id/cancel  student withdraws (only before allocation) */
router.patch('/:id/cancel', authorize('applications.apply', 'applications.review'), validate(z.object({ reason: z.string().trim().min(3).max(500) })), async (req, res) => {
  await db.transaction(async (conn) => {
    const app = await loadApp(req.params.id, conn);
    assertAccess(req.user, app);
    await transition(conn, req, app, 'cancelled', req.body.reason);
    await conn.query("UPDATE students SET hostel_status = 'not_applied' WHERE id = ? AND hostel_status IN ('applied','approved')", [app.student_id]);
  });
  ok(res, { id: Number(req.params.id) });
});

module.exports = router;
module.exports.TRANSITIONS = TRANSITIONS;
