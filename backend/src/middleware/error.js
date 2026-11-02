const { ZodError } = require('zod');
const multer = require('multer');
const { AppError } = require('../utils/AppError');
const env = require('../config/env');

// Maps MySQL constraint errors to safe, user-facing messages.
const MYSQL_ERRORS = {
  ER_DUP_ENTRY: [409, 'DUPLICATE_RECORD', 'A record with the same unique value already exists'],
  ER_CHECK_CONSTRAINT_VIOLATED: [422, 'CONSTRAINT_VIOLATION', 'The data violates a business rule'],
  ER_NO_REFERENCED_ROW_2: [422, 'INVALID_REFERENCE', 'A referenced record does not exist'],
  ER_ROW_IS_REFERENCED_2: [409, 'RECORD_IN_USE', 'This record is referenced by other records and cannot be removed'],
  ER_LOCK_DEADLOCK: [409, 'CONCURRENT_UPDATE', 'Another user updated this record at the same time. Please retry.'],
  ER_LOCK_WAIT_TIMEOUT: [409, 'CONCURRENT_UPDATE', 'The record is busy. Please retry.'],
  ER_SIGNAL_EXCEPTION: [403, 'READ_ONLY', 'This record is read-only'],
};

// Friendlier messages for specific unique keys.
const DUP_KEYS = {
  uq_alloc_active_bed: ['BED_ALREADY_OCCUPIED', 'Bed is already occupied'],
  uq_alloc_active_student: ['STUDENT_ALREADY_ALLOCATED', 'Student already has an active bed allocation'],
  uq_attendance: ['DUPLICATE_ATTENDANCE', 'Attendance for this student and date is already recorded'],
  transaction_id: ['DUPLICATE_TRANSACTION', 'A payment with this transaction ID already exists'],
  uq_visitor_inside: ['VISITOR_ALREADY_INSIDE', 'This visitor is already checked in'],
  uq_app_open: ['APPLICATION_EXISTS', 'An active hostel application already exists for this academic year'],
  'users.email': ['EMAIL_EXISTS', 'This email address is already registered'],
  'students.email': ['EMAIL_EXISTS', 'This email address is already registered'],
  register_number: ['REGISTER_NUMBER_EXISTS', 'This register number already exists'],
  uq_room: ['ROOM_EXISTS', 'A room with this number already exists in the hostel'],
  uq_exit_open: ['EXIT_ALREADY_REQUESTED', 'An exit request is already in progress for this student'],
  uq_student_fee: ['FEE_ALREADY_ASSIGNED', 'This fee is already assigned to the student'],
};

function notFoundHandler(req, _res, next) {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again later.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    details = err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));
    message = details[0] ? `${details[0].field || 'input'}: ${details[0].message}` : 'Invalid input';
  } else if (err instanceof multer.MulterError) {
    status = 400;
    code = 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.maxUploadBytes / 1024 / 1024} MB)` : 'File upload failed';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (err.code && MYSQL_ERRORS[err.code]) {
    [status, code, message] = MYSQL_ERRORS[err.code];
    if (err.code === 'ER_DUP_ENTRY') {
      const hit = Object.entries(DUP_KEYS).find(([key]) => err.sqlMessage?.includes(key));
      if (hit) [code, message] = hit[1];
    }
  }

  if (status >= 500 && !env.isTest) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);

  res.status(status).json({ success: false, message, code, ...(details ? { details } : {}) });
}

module.exports = { notFoundHandler, errorHandler };
