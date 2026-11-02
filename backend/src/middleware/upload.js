const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { badRequest } = require('../utils/AppError');

const ALLOWED = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  // Random server-side names; the original name is stored only as metadata.
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ALLOWED[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okExt = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    if (!ALLOWED[file.mimetype] || !okExt) return cb(badRequest('Only PDF, JPG and PNG files are allowed', 'INVALID_FILE_TYPE'));
    cb(null, true);
  },
});

// Verify magic bytes after upload so a renamed executable cannot slip through.
function verifyFileSignature(filePath, mimetype) {
  const buf = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  const hex = buf.toString('hex');
  const ok = (mimetype === 'application/pdf' && hex.startsWith('25504446'))
    || (mimetype === 'image/png' && hex.startsWith('89504e47'))
    || (mimetype === 'image/jpeg' && hex.startsWith('ffd8ff'));
  if (!ok) {
    fs.unlinkSync(filePath);
    throw badRequest('File content does not match its type', 'INVALID_FILE_CONTENT');
  }
}

const checkUploads = (req, _res, next) => {
  const files = req.files ? [].concat(...Object.values(req.files)) : req.file ? [req.file] : [];
  files.forEach((f) => verifyFileSignature(f.path, f.mimetype));
  next();
};

function sendUpload(res, storedName, downloadName) {
  const safe = path.basename(storedName);
  const full = path.join(env.uploadDir, safe);
  if (!fs.existsSync(full)) throw badRequest('File is no longer available', 'FILE_MISSING');
  res.download(full, downloadName || safe);
}

module.exports = { upload, checkUploads, sendUpload };
