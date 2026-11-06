const fs = require('fs');
const path = require('path');

// 1. complaints.routes.js
const cPath = path.join(__dirname, '../backend/src/modules/complaints/complaints.routes.js');
let cCode = fs.readFileSync(cPath, 'utf8').replace(/\r\n/g, '\n');

if (!cCode.includes("upload.fields([{ name: 'images', maxCount: 3 }])")) {
  cCode = cCode.replace(
    "router.post('/', authorize('complaints.create', 'complaints.assign'),\n  validate(z.object({",
    "router.post('/', authorize('complaints.create', 'complaints.assign'),\n  upload.fields([{ name: 'images', maxCount: 3 }]), checkUploads,\n  validate(z.object({"
  );
  fs.writeFileSync(cPath, cCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added upload.fields to complaints.routes.js POST /');
} else {
  console.log('complaints.routes.js already has upload.fields');
}

// 2. maintenance.routes.js
const mPath = path.join(__dirname, '../backend/src/modules/maintenance/maintenance.routes.js');
let mCode = fs.readFileSync(mPath, 'utf8').replace(/\r\n/g, '\n');

if (!mCode.includes("upload.fields([{ name: 'images', maxCount: 3 }")) {
  mCode = mCode.replace(
    "router.post('/', authorize('maintenance.manage'),\n  validate(z.object({",
    "router.post('/', authorize('maintenance.manage'),\n  upload.fields([{ name: 'images', maxCount: 3 }, { name: 'before_images', maxCount: 3 }, { name: 'after_images', maxCount: 3 }]), checkUploads,\n  validate(z.object({"
  );
  mCode = mCode.replace(
    "router.patch('/:id', authorize('maintenance.manage'),\n  validate(z.object({",
    "router.patch('/:id', authorize('maintenance.manage'),\n  upload.fields([{ name: 'images', maxCount: 3 }, { name: 'before_images', maxCount: 3 }, { name: 'after_images', maxCount: 3 }]), checkUploads,\n  validate(z.object({"
  );
  fs.writeFileSync(mPath, mCode.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added upload.fields to maintenance.routes.js');
} else {
  console.log('maintenance.routes.js already has upload.fields');
}
