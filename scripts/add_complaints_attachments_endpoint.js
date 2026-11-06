const fs = require('fs');
const path = require('path');

const cPath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let cCode = fs.readFileSync(cPath, 'utf8').replace(/\r\n/g, '\n');

const attachmentsRoute = `
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
});
`;

if (!cCode.includes("router.post('/:id/attachments'")) {
  cCode = cCode.replace("module.exports = router;", attachmentsRoute + "\nmodule.exports = router;");
  fs.writeFileSync(cPath, cCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added POST /:id/attachments to complaints.routes.js');
} else {
  console.log('Already includes POST /:id/attachments');
}
