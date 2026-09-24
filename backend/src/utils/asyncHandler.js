'use strict';

/**
 * Wraps an async route handler so rejected promises reach Express's
 * error middleware instead of becoming unhandled rejections.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
