const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/maintenance/maintenance.routes.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add fs and upload require
if (!code.includes("require('../../middleware/upload')")) {
  code = code.replace(
    "const { notFound, conflict, badRequest } = require('../../utils/AppError');",
    "const fs = require('fs');\nconst { upload, checkUploads } = require('../../middleware/upload');\nconst { notFound, conflict, badRequest } = require('../../utils/AppError');"
  );
}

// 2. Add attachments_count to GET /
const oldGetSelect = `    select: \`m.*, h.code AS hostel_code, r.room_number, b.bed_code, c.complaint_code, a.name AS assigned_to_name, rq.name AS requested_by_name,
             DATEDIFF(NOW(), m.created_at) AS age_days\`,`;

const newGetSelect = `    select: \`m.*, h.code AS hostel_code, r.room_number, b.bed_code, c.complaint_code, a.name AS assigned_to_name, rq.name AS requested_by_name,
             DATEDIFF(NOW(), m.created_at) AS age_days,
             (SELECT COUNT(*) FROM complaint_maintenance_attachments cma WHERE cma.maintenance_id = m.id) AS attachments_count\`,`;

if (code.includes(oldGetSelect)) {
  code = code.replace(oldGetSelect, newGetSelect);
}

// 3. Add GET /:id before POST /
const getByIdEndpoint = `/** GET /api/maintenance/:id  get maintenance details with attachments */
router.get('/:id', authorize('maintenance.view'), async (req, res) => {
  const m = await db.one(
    \`SELECT m.*, h.code AS hostel_code, h.name AS hostel_name, r.room_number, b.bed_code, c.complaint_code,
            a.name AS assigned_to_name, rq.name AS requested_by_name, DATEDIFF(NOW(), m.created_at) AS age_days
     FROM maintenance_requests m JOIN hostels h ON h.id = m.hostel_id LEFT JOIN rooms r ON r.id = m.room_id
     LEFT JOIN beds b ON b.id = m.bed_id LEFT JOIN complaints c ON c.id = m.complaint_id
     LEFT JOIN users a ON a.id = m.assigned_to LEFT JOIN users rq ON rq.id = m.requested_by
     WHERE m.id = ?\`, [req.params.id]);
  if (!m) throw notFound('Maintenance request');
  assertHostelAccess(req.user, m.hostel_id);
  const attachments = await db.query(
    \`SELECT id, complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, created_at,
            CONCAT('/uploads/', file_name) AS url
     FROM complaint_maintenance_attachments WHERE maintenance_id = ? ORDER BY id\`, [m.id]);
  ok(res, { ...m, attachments: attachments || [] });
});\n\n`;

if (!code.includes("router.get('/:id'")) {
  code = code.replace("/** POST /api/maintenance", getByIdEndpoint + "/** POST /api/maintenance");
}

// 4. Update POST / to accept upload.fields and store before images
const oldPost = `/** POST /api/maintenance  { hostelId?, roomId?, bedId?, complaintId?, category, priority, title, description, blocksRoom, assignedTo? } */
router.post('/', authorize('maintenance.manage'),
  validate(z.object({`;

const newPost = `/** POST /api/maintenance  { hostelId?, roomId?, bedId?, complaintId?, category, priority, title, description, blocksRoom, assignedTo? } */
router.post('/', authorize('maintenance.manage'),
  upload.fields([{ name: 'images', maxCount: 3 }, { name: 'before_images', maxCount: 3 }, { name: 'after_images', maxCount: 3 }]),
  checkUploads,
  validate(z.object({`;

if (code.includes(oldPost)) {
  code = code.replace(oldPost, newPost);
}

const oldPostHandlerStart = `  async (req, res) => {
    const b = req.body;`;

const newPostHandlerStart = `  async (req, res) => {
    try {
    const b = req.body;`;

if (code.includes(oldPostHandlerStart)) {
  code = code.replace(oldPostHandlerStart, newPostHandlerStart);
}

const oldPostInsert = `      await audit(req, { action: 'MAINTENANCE_CREATED', module: 'maintenance', recordId: r.insertId, summary: \`\${code}: \${b.title}\${b.blocksRoom ? ' (room blocked)' : ''}\`, newValue: b }, conn);
      return { id: r.insertId, requestCode: code };
    });
    created(res, out);
  });`;

const newPostInsert = `      const beforeFiles = req.files?.before_images || req.files?.images || [];
      const afterFiles = req.files?.after_images || [];
      for (const f of beforeFiles) {
        await conn.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'before', ?, ?, ?, ?, ?)\`,
          [b.complaintId || null, r.insertId, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
      }
      for (const f of afterFiles) {
        await conn.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'after', ?, ?, ?, ?, ?)\`,
          [b.complaintId || null, r.insertId, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
      }

      await audit(req, { action: 'MAINTENANCE_CREATED', module: 'maintenance', recordId: r.insertId, summary: \`\${code}: \${b.title}\${b.blocksRoom ? ' (room blocked)' : ''}\`, newValue: b }, conn);
      return { id: r.insertId, requestCode: code };
    });
    created(res, out);
    } catch (err) {
      const allFiles = req.files ? [].concat(...Object.values(req.files)) : [];
      allFiles.forEach((f) => fs.unlink(f.path, () => {}));
      throw err;
    }
  });`;

if (code.includes(oldPostInsert)) {
  code = code.replace(oldPostInsert, newPostInsert);
}

// 5. Update PATCH /:id to accept upload.fields and store images
const oldPatch = `/** PATCH /api/maintenance/:id  { status?, assignedTo?, notes?, cost? } */
router.patch('/:id', authorize('maintenance.manage'),
  validate(z.object({`;

const newPatch = `/** PATCH /api/maintenance/:id  { status?, assignedTo?, notes?, cost? } */
router.patch('/:id', authorize('maintenance.manage'),
  upload.fields([{ name: 'images', maxCount: 3 }, { name: 'before_images', maxCount: 3 }, { name: 'after_images', maxCount: 3 }]),
  checkUploads,
  validate(z.object({`;

if (code.includes(oldPatch)) {
  code = code.replace(oldPatch, newPatch);
}

const oldPatchHandlerStart = `  async (req, res) => {
    const b = req.body;`;

const newPatchHandlerStart = `  async (req, res) => {
    try {
    const b = req.body;`;

if (code.includes(oldPatchHandlerStart)) {
  code = code.replace(oldPatchHandlerStart, newPatchHandlerStart);
}

const oldPatchEnd = `      await audit(req, { action: 'MAINTENANCE_UPDATED', module: 'maintenance', recordId: m.id, summary: \`\${m.request_code}: \${m.status} → \${status}\${roomReleased ? ' (room reactivated)' : ''}\`, oldValue: { status: m.status, assignedTo: m.assigned_to }, newValue: b }, conn);
      return { id: m.id, status, roomReleased };
    });
    ok(res, out);
  });`;

const newPatchEnd = `      const beforeFiles = req.files?.before_images || [];
      const afterFiles = req.files?.after_images || (status === 'completed' ? (req.files?.images || []) : []);
      const otherFiles = (status !== 'completed' ? (req.files?.images || []) : []);

      for (const f of beforeFiles) {
        await conn.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'before', ?, ?, ?, ?, ?)\`,
          [m.complaint_id || null, m.id, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
      }
      for (const f of afterFiles) {
        await conn.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'after', ?, ?, ?, ?, ?)\`,
          [m.complaint_id || null, m.id, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
      }
      for (const f of otherFiles) {
        await conn.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'before', ?, ?, ?, ?, ?)\`,
          [m.complaint_id || null, m.id, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
      }

      await audit(req, { action: 'MAINTENANCE_UPDATED', module: 'maintenance', recordId: m.id, summary: \`\${m.request_code}: \${m.status} → \${status}\${roomReleased ? ' (room reactivated)' : ''}\`, oldValue: { status: m.status, assignedTo: m.assigned_to }, newValue: b }, conn);
      return { id: m.id, status, roomReleased };
    });
    ok(res, out);
    } catch (err) {
      const allFiles = req.files ? [].concat(...Object.values(req.files)) : [];
      allFiles.forEach((f) => fs.unlink(f.path, () => {}));
      throw err;
    }
  });

/** POST /api/maintenance/:id/attachments (multipart; up to 3 images) */
router.post('/:id/attachments', authorize('maintenance.manage'),
  upload.fields([{ name: 'images', maxCount: 3 }, { name: 'before_images', maxCount: 3 }, { name: 'after_images', maxCount: 3 }]),
  checkUploads,
  async (req, res) => {
    const m = await db.one('SELECT * FROM maintenance_requests WHERE id = ?', [req.params.id]);
    if (!m) throw notFound('Maintenance request');
    assertHostelAccess(req.user, m.hostel_id);
    const defaultType = ['completed'].includes(m.status) ? 'after' : 'before';
    const beforeFiles = req.files?.before_images || (req.body.attachmentType === 'before' ? (req.files?.images || []) : []);
    const afterFiles = req.files?.after_images || (req.body.attachmentType === 'after' ? (req.files?.images || []) : []);
    const fallbackFiles = (!beforeFiles.length && !afterFiles.length) ? (req.files?.images || []) : [];
    const allFiles = [...beforeFiles, ...afterFiles, ...fallbackFiles];
    if (allFiles.length === 0) throw badRequest('No images provided', 'IMAGES_REQUIRED');

    try {
      const inserted = [];
      for (const f of beforeFiles) {
        const [r] = await db.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'before', ?, ?, ?, ?, ?)\`,
          [m.complaint_id || null, m.id, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
        inserted.push({ id: r.insertId, file_name: f.filename, original_name: f.originalname, url: \`/uploads/\${f.filename}\`, attachment_type: 'before' });
      }
      for (const f of afterFiles) {
        const [r] = await db.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, 'after', ?, ?, ?, ?, ?)\`,
          [m.complaint_id || null, m.id, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
        inserted.push({ id: r.insertId, file_name: f.filename, original_name: f.originalname, url: \`/uploads/\${f.filename}\`, attachment_type: 'after' });
      }
      for (const f of fallbackFiles) {
        const t = ['before', 'after'].includes(req.body.attachmentType) ? req.body.attachmentType : defaultType;
        const [r] = await db.query(
          \`INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
          [m.complaint_id || null, m.id, t, f.filename, f.originalname.slice(0, 255), f.size, f.mimetype, req.user.id]
        );
        inserted.push({ id: r.insertId, file_name: f.filename, original_name: f.originalname, url: \`/uploads/\${f.filename}\`, attachment_type: t });
      }
      created(res, { attachments: inserted });
    } catch (err) {
      allFiles.forEach((f) => fs.unlink(f.path, () => {}));
      throw err;
    }
  }
);`;

if (code.includes(oldPatchEnd)) {
  code = code.replace(oldPatchEnd, newPatchEnd);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched maintenance.routes.js');
