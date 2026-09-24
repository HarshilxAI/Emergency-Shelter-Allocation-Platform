'use strict';

const ApiError = require('../utils/ApiError');
const config = require('../config/env');

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

/** Maps well-known PostgreSQL error codes onto friendly HTTP responses. */
function translateDbError(err) {
  switch (err.code) {
    case '23505': // unique_violation
      return ApiError.conflict('That record already exists');
    case '23503': // foreign_key_violation
      return ApiError.badRequest('Referenced record does not exist');
    case '23514': // check_violation
      return ApiError.badRequest('One of the submitted values is not allowed');
    case '22P02': // invalid_text_representation
      return ApiError.badRequest('A submitted value has the wrong format');
    case 'ECONNREFUSED':
    case '57P01':
    case '08006':
      return new ApiError(503, 'The database is unavailable. Please try again shortly.', null, 'DB_UNAVAILABLE');
    default:
      return null;
  }
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let error = err;

  if (!(error instanceof ApiError)) {
    const translated = translateDbError(err);
    error = translated || ApiError.internal();
  }

  if (error.statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message, err.stack);
  }

  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code || undefined,
      details: error.details || undefined,
      ...(config.isProduction ? {} : { stack: err.stack })
    }
  });
}

module.exports = { errorHandler, notFoundHandler };
