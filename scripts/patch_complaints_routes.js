const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add fs and upload requires
if (!code.includes("require('../../middleware/upload')")) {
  code = code.replace(
    "const { notFound, forbidden, conflict, badRequest } = require('../../utils/AppError');",
    "const fs = require('fs');\nconst { upload, checkUploads } = require('../../middleware/upload');\nconst { notFound, forbidden, conflict, badRequest } = require('../../utils/AppError');"
  );
}

// 2. Add attachments_count to SELECT
if (!code.includes("attachments_count")) {
  code = code.replace(
    "const SELECT = `c.*, s.name AS student_name, s.register_number, s.phone AS student_phone, h.code AS hostel_code, h.name AS hostel_name,\n  r.room_number, u.name AS assigned_to_name, u.phone AS assigned_to_phone,",
    "const SELECT = `c.*, s.name AS student_name, s.register_number, s.phone AS student_phone, h.code AS hostel_code, h.name AS hostel_name,\n  r.room_number, u.name AS assigned_to_name, u.phone AS assigned_to_phone,\n  (SELECT COUNT(*) FROM complaint_maintenance_attachments cma WHERE cma.complaint_id = c.id) AS attachments_count,"
  );
}

// 3. Update router.post('/', ...) to accept upload.fields
const oldPost = `/** POST /api/complaints  { category, priority, title, description, studentId (staff only) } - auto-assigns by skill and workload */
router.post('/', authorize('complaints.create', 'complaints.assign'),
  validate(z.object({`;

const newPost = `/** POST /api/complaints  { category, priority, title, description, studentId (staff only) } - auto-assigns by skill and workload */
router.post('/', authorize('complaints.create', 'complaints.assign'),
  upload.fields([{ name: 'images', maxCount: 3 }]), checkUploads,
  validate(z.object({`;

if (code.includes(oldPost)) {
  code = code.replace(oldPost, newPost);
}

// 4. In router.post handler, wrap in try/catch to unlink files on error and insert attachments in transaction
const oldInsert = `      const code = await assignCode(conn, 'complaints', 'complaint_code', 'CMP', r.insertId);
      await addUpdate(conn, r.insertId, req.user.id, 'status', null, 'pending', 'Complaint submitted');`;

const newInsert = `      const code = await assignCode(conn, 'complaints', 'complaint_code', 'CMP', r.insertId);
      await addUpdate(conn, r.insertId, req.user.id, 'status', null, 'pending', 'Complaint submitted');

      const files = req.files?.images || (Array.isArray(req.files) ? req.files : []);
      if (files && files.length > 0) {
        for (const f of files) {
          await conn.query(
            \`INSERT INTO complaint_maintenance_attachments (complaint_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
             VALUES (?, 'complaint', ?, ?, ?, ?, ?)\`,
            [r.insertId, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
          );
        }
      }`;

if (code.includes(oldInsert)) {
  code = code.replace(oldInsert, newInsert);
}

// Wrap the whole handler body of POST / in try...catch to remove uploaded files if validation/duplicate failed
const postHandlerStart = `  async (req, res) => {
    const b = req.body;`;

const postHandlerStartNew = `  async (req, res) => {
    try {
    const b = req.body;`;

const postHandlerEnd = `    created(res, out);
  });`;

const postHandlerEndNew = `    created(res, out);
    } catch (err) {
      const files = req.files?.images || (Array.isArray(req.files) ? req.files : []);
      if (files && files.length > 0) {
        files.forEach((f) => fs.unlink(f.path, () => {}));
      }
      throw err;
    }
  });`;

if (code.includes(postHandlerStart) && code.includes(postHandlerEnd)) {
  code = code.replace(postHandlerStart, postHandlerStartNew);
  code = code.replace(postHandlerEnd, postHandlerEndNew);
}

// 5. In router.get('/:id', ...), query attachments and add to response
const oldGetId = `  const [updates, assignments, maintenance] = await Promise.all([
    db.query(
      \`SELECT cu.*, u.name AS user_name, r.label AS user_role FROM complaint_updates cu
         LEFT JOIN users u ON u.id = cu.user_id LEFT JOIN roles r ON r.id = u.role_id WHERE cu.complaint_id = ? ORDER BY cu.id\`, [c.id]),
    db.query(
      \`SELECT ca.*, u.name AS assigned_to_name, b.name AS assigned_by_name FROM complaint_assignments ca
         JOIN users u ON u.id = ca.assigned_to LEFT JOIN users b ON b.id = ca.assigned_by WHERE ca.complaint_id = ? ORDER BY ca.id\`, [c.id]),
    db.query('SELECT id, request_code, status FROM maintenance_requests WHERE complaint_id = ?', [c.id]),
  ]);
  const role = actorRole(req.user, c);
  const allowed = role ? Object.entries(TRANSITIONS[c.status]).filter(([, roles]) => roles.includes(role)).map(([s]) => s) : [];
  ok(res, { ...c, updates, assignments, maintenance, actorRole: role, allowedTransitions: allowed });`;

const newGetId = `  const [updates, assignments, maintenance, attachments] = await Promise.all([
    db.query(
      \`SELECT cu.*, u.name AS user_name, r.label AS user_role FROM complaint_updates cu
         LEFT JOIN users u ON u.id = cu.user_id LEFT JOIN roles r ON r.id = u.role_id WHERE cu.complaint_id = ? ORDER BY cu.id\`, [c.id]),
    db.query(
      \`SELECT ca.*, u.name AS assigned_to_name, b.name AS assigned_by_name FROM complaint_assignments ca
         JOIN users u ON u.id = ca.assigned_to LEFT JOIN users b ON b.id = ca.assigned_by WHERE ca.complaint_id = ? ORDER BY ca.id\`, [c.id]),
    db.query('SELECT id, request_code, status FROM maintenance_requests WHERE complaint_id = ?', [c.id]),
    db.query(\`SELECT id, complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, created_at,
                     CONCAT('/uploads/', file_name) AS url
              FROM complaint_maintenance_attachments WHERE complaint_id = ? ORDER BY id\`, [c.id]),
  ]);
  const role = actorRole(req.user, c);
  const allowed = role ? Object.entries(TRANSITIONS[c.status]).filter(([, roles]) => roles.includes(role)).map(([s]) => s) : [];
  ok(res, { ...c, updates, assignments, maintenance, attachments: attachments || [], actorRole: role, allowedTransitions: allowed });`;

if (code.includes(oldGetId)) {
  code = code.replace(oldGetId, newGetId);
}

// 6. In PATCH /:id/status, add upload.fields and image saving on resolve
const oldPatchStatus = `router.patch('/:id/status', validate(z.object({`;
const newPatchStatus = `router.patch('/:id/status', upload.fields([{ name: 'images', maxCount: 3 }]), checkUploads, validate(z.object({`;

if (code.includes(oldPatchStatus)) {
  code = code.replace(oldPatchStatus, newPatchStatus);
}

const oldPatchEnd = `    await audit(req, { action: 'COMPLAINT_STATUS', module: 'complaints', recordId: c.id, summary: \`\${c.complaint_code}: \${c.status} → \${b.status}\`, oldValue: { status: c.status }, newValue: b }, conn);
    return { id: c.id, status: b.status };
  });
  ok(res, out);
});`;

const newPatchEnd = `    const files = req.files?.images || (Array.isArray(req.files) ? req.files : []);
    if (files && files.length > 0) {
      const attType = ['resolved', 'closed'].includes(b.status) ? 'after' : 'complaint';
      for (const f of files) {
        await conn.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)\`,
          [c.id, attType, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
      }
    }

    await audit(req, { action: 'COMPLAINT_STATUS', module: 'complaints', recordId: c.id, summary: \`\${c.complaint_code}: \${c.status} → \${b.status}\`, oldValue: { status: c.status }, newValue: b }, conn);
    return { id: c.id, status: b.status };
  });
  ok(res, out);
});

/** POST /api/complaints/:id/attachments (multipart; up to 3 images) */
router.post('/:id/attachments', upload.fields([{ name: 'images', maxCount: 3 }]), checkUploads, async (req, res) => {
  const c = await loadComplaint(req.params.id);
  if (!canView(req.user, c)) throw forbidden();
  const files = req.files?.images || (Array.isArray(req.files) ? req.files : []);
  if (!files || files.length === 0) throw badRequest('No images provided', 'IMAGES_REQUIRED');
  const type = ['before', 'after', 'complaint'].includes(req.body.attachmentType) ? req.body.attachmentType : 'complaint';
  try {
    const inserted = [];
    for (const f of files) {
      const [r] = await db.query(
        \`INSERT INTO complaint_maintenance_attachments (complaint_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)\`,
        [c.id, type, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
      );
      inserted.push({ id: r.insertId, file_name: f.filename, original_name: f.originalname, url: \`/uploads/\${f.filename}\`, attachment_type: type });
    }
    await addUpdate(db.pool, c.id, req.user.id, 'note', null, null, \`Attached \${files.length} image(s) (\${type})\`);
    created(res, { attachments: inserted });
  } catch (err) {
    if (files) files.forEach((f) => fs.unlink(f.path, () => {}));
    throw err;
  }
});`;

if (code.includes(oldPatchEnd)) {
  code = code.replace(oldPatchEnd, newPatchEnd);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched complaints.routes.js');
