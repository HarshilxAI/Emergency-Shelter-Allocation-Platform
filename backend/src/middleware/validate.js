'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Validates req[source] against a zod schema and replaces it with the
 * parsed (coerced, stripped) result. Field errors are returned as a map so
 * the frontend can highlight individual inputs.
 */
module.exports = function validate(schema, source = 'body') {
  return function validator(req, res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return next(ApiError.badRequest('Please correct the highlighted fields', fieldErrors));
    }
    req[source] = result.data;
    next();
  };
};
