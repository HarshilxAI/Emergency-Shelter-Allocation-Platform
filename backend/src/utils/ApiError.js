'use strict';

/** Error type carrying an HTTP status so the error handler can respond correctly. */
class ApiError extends Error {
  constructor(statusCode, message, details = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, details) { return new ApiError(400, message, details, 'BAD_REQUEST'); }
  static unauthorized(message = 'Authentication required') { return new ApiError(401, message, null, 'UNAUTHORIZED'); }
  static forbidden(message = 'You do not have permission to do that') { return new ApiError(403, message, null, 'FORBIDDEN'); }
  static notFound(message = 'Resource not found') { return new ApiError(404, message, null, 'NOT_FOUND'); }
  static conflict(message, details) { return new ApiError(409, message, details, 'CONFLICT'); }
  static unprocessable(message, details) { return new ApiError(422, message, details, 'UNPROCESSABLE'); }
  static internal(message = 'Something went wrong on our side') { return new ApiError(500, message, null, 'INTERNAL'); }
}

module.exports = ApiError;
