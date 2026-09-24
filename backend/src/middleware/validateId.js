'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Ensures a route parameter is a positive integer before it reaches the
 * database. Without this, `/shelters/abc` would surface as a Postgres
 * "invalid input syntax" error instead of a clear 400.
 * The parsed number is written back onto req.params.
 */
module.exports = function validateId(param = 'id') {
  return function idGuard(req, res, next) {
    const raw = req.params[param];
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      return next(ApiError.badRequest(`"${raw}" is not a valid ${param}`));
    }
    req.params[param] = n;
    next();
  };
};
