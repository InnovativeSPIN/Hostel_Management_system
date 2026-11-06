const fs = require('fs');
const path = require('path');

const cPath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let cCode = fs.readFileSync(cPath, 'utf8').replace(/\r\n/g, '\n');

const targetPost = "router.post('/', authorize('complaints.create', 'complaints.assign'),\n  validate(z.object({";
const replacementPost = "router.post('/', authorize('complaints.create', 'complaints.assign'),\n  upload.fields([{ name: 'images', maxCount: 3 }]), checkUploads,\n  validate(z.object({";

if (cCode.includes(targetPost)) {
  cCode = cCode.replace(targetPost, replacementPost);
  fs.writeFileSync(cPath, cCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added upload.fields to POST / in complaints.routes.js');
} else {
  console.log('Could not find targetPost in complaints.routes.js');
}
