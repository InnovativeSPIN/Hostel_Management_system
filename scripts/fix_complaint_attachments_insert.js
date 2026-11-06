const fs = require('fs');
const path = require('path');

const cPath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let cCode = fs.readFileSync(cPath, 'utf8').replace(/\r\n/g, '\n');

const target = "await addUpdate(conn, r.insertId, req.user.id, 'status', null, 'pending', 'Complaint submitted');";
const replacement = `await addUpdate(conn, r.insertId, req.user.id, 'status', null, 'pending', 'Complaint submitted');

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

if (cCode.includes(target) && !cCode.includes("INSERT INTO complaint_maintenance_attachments (complaint_id")) {
  cCode = cCode.replace(target, replacement);
  fs.writeFileSync(cPath, cCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Inserted attachment logic into complaints.routes.js POST /');
} else {
  console.log('Target not found or already inserted');
}
