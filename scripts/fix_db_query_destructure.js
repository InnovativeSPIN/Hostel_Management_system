const fs = require('fs');
const path = require('path');

// 1. complaints.routes.js
const cPath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let cCode = fs.readFileSync(cPath, 'utf8');
cCode = cCode.replace("const [r] = await db.query(\n        `INSERT INTO complaint_maintenance_attachments", "const r = await db.query(\n        `INSERT INTO complaint_maintenance_attachments");
cCode = cCode.replace("const [r] = await db.query(\r\n        `INSERT INTO complaint_maintenance_attachments", "const r = await db.query(\r\n        `INSERT INTO complaint_maintenance_attachments");
fs.writeFileSync(cPath, cCode, 'utf8');
console.log('Fixed db.query in complaints.routes.js');

// 2. maintenance.routes.js
const mPath = path.join(__dirname, '../backend/src/modules/maintenance/maintenance.routes.js');
let mCode = fs.readFileSync(mPath, 'utf8');
mCode = mCode.replaceAll("const [r] = await db.query(\n          `INSERT INTO complaint_maintenance_attachments", "const r = await db.query(\n          `INSERT INTO complaint_maintenance_attachments");
mCode = mCode.replaceAll("const [r] = await db.query(\r\n          `INSERT INTO complaint_maintenance_attachments", "const r = await db.query(\r\n          `INSERT INTO complaint_maintenance_attachments");
fs.writeFileSync(mPath, mCode, 'utf8');
console.log('Fixed db.query in maintenance.routes.js');
