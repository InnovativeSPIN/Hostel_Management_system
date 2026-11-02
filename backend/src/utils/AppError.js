class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError(400, message, code, details);
const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') => new AppError(401, message, code);
const forbidden = (message = 'You do not have permission to perform this action', code = 'FORBIDDEN') => new AppError(403, message, code);
const notFound = (what = 'Record', code = 'NOT_FOUND') => new AppError(404, `${what} not found`, code);
const conflict = (message, code = 'CONFLICT') => new AppError(409, message, code);
const unprocessable = (message, code = 'UNPROCESSABLE') => new AppError(422, message, code);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
