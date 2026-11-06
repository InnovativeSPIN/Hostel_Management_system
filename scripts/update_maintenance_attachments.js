const fs = require('fs');
const path = require('path');

const mPath = path.join(__dirname, '../backend/src/modules/maintenance/maintenance.routes.js');
let mCode = fs.readFileSync(mPath, 'utf8').replace(/\r\n/g, '\n');

// 1. In POST /api/maintenance
const targetPostAudit = "await audit(req, { action: 'MAINTENANCE_CREATED', module: 'maintenance', recordId: r.insertId, summary: `${code}: ${b.title}${b.blocksRoom ? ' (room blocked)' : ''}`, newValue: b }, conn);";
const replacementPostAudit = `const beforeFiles = req.files?.before_images || req.files?.images || [];
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

      await audit(req, { action: 'MAINTENANCE_CREATED', module: 'maintenance', recordId: r.insertId, summary: \`\${code}: \${b.title}\${b.blocksRoom ? ' (room blocked)' : ''}\`, newValue: b }, conn);`;

if (mCode.includes(targetPostAudit) && !mCode.includes("INSERT INTO complaint_maintenance_attachments (complaint_id, maintenance_id")) {
  mCode = mCode.replace(targetPostAudit, replacementPostAudit);
  console.log('Inserted POST attachments logic in maintenance.routes.js');
}

// 2. In PATCH /api/maintenance/:id
const targetPatchAudit = "await audit(req, { action: 'MAINTENANCE_UPDATED', module: 'maintenance', recordId: m.id, summary: `${m.request_code}: ${m.status} → ${status}${roomReleased ? ' (room reactivated)' : ''}`, oldValue: { status: m.status, assignedTo: m.assigned_to }, newValue: b }, conn);";
const replacementPatchAudit = `const beforeFiles = req.files?.before_images || [];
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

      await audit(req, { action: 'MAINTENANCE_UPDATED', module: 'maintenance', recordId: m.id, summary: \`\${m.request_code}: \${m.status} → \${status}\${roomReleased ? ' (room reactivated)' : ''}\`, oldValue: { status: m.status, assignedTo: m.assigned_to }, newValue: b }, conn);`;

if (mCode.includes(targetPatchAudit)) {
  mCode = mCode.replace(targetPatchAudit, replacementPatchAudit);
  console.log('Inserted PATCH attachments logic in maintenance.routes.js');
}

// 3. Add POST /api/maintenance/:id/attachments before module.exports
const attachmentsRoute = `
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
);
`;

if (!mCode.includes("router.post('/:id/attachments'")) {
  mCode = mCode.replace("module.exports = router;", attachmentsRoute + "\nmodule.exports = router;");
  console.log('Added POST /:id/attachments in maintenance.routes.js');
}

fs.writeFileSync(mPath, mCode.replace(/\n/g, '\r\n'), 'utf8');
console.log('maintenance.routes.js successfully updated.');
