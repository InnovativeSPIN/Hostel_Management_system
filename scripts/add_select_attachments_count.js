const fs = require('fs');
const path = require('path');

const cPath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let cCode = fs.readFileSync(cPath, 'utf8').replace(/\r\n/g, '\n');

const oldSelect = "r.room_number, u.name AS assigned_to_name, u.phone AS assigned_to_phone,";
const newSelect = "r.room_number, u.name AS assigned_to_name, u.phone AS assigned_to_phone,\n  (SELECT COUNT(*) FROM complaint_maintenance_attachments cma WHERE cma.complaint_id = c.id) AS attachments_count,";

if (cCode.includes(oldSelect) && !cCode.includes("attachments_count")) {
  cCode = cCode.replace(oldSelect, newSelect);
  fs.writeFileSync(cPath, cCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added attachments_count to SELECT in complaints.routes.js');
}
