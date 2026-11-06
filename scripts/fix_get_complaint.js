const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let code = fs.readFileSync(filePath, 'utf8');

const target = "const [updates, assignments, maintenance] = await Promise.all([";
const replacement = "const [updates, assignments, maintenance, attachments] = await Promise.all([";

const targetEnd = "db.query('SELECT id, request_code, status FROM maintenance_requests WHERE complaint_id = ?', [c.id]),\n  ]);";
const targetEndCRLF = "db.query('SELECT id, request_code, status FROM maintenance_requests WHERE complaint_id = ?', [c.id]),\r\n  ]);";

const replacementEnd = `db.query('SELECT id, request_code, status FROM maintenance_requests WHERE complaint_id = ?', [c.id]),
    db.query(\`SELECT id, complaint_id, maintenance_id, attachment_type, file_name, original_name, file_size, mime_type, created_at,
                     CONCAT('/uploads/', file_name) AS url
              FROM complaint_maintenance_attachments WHERE complaint_id = ? ORDER BY id\`, [c.id]),
  ]);`;

const targetReturn = "ok(res, { ...c, updates, assignments, maintenance, actorRole: role, allowedTransitions: allowed });";
const replacementReturn = "ok(res, { ...c, updates, assignments, maintenance, attachments: attachments || [], actorRole: role, allowedTransitions: allowed });";

code = code.replace(target, replacement);
if (code.includes(targetEndCRLF)) {
  code = code.replace(targetEndCRLF, replacementEnd);
} else {
  code = code.replace(targetEnd, replacementEnd);
}
code = code.replace(targetReturn, replacementReturn);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Fixed GET /:id in complaints.routes.js');
