'use strict';

const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const db = require('../config/database');

/**
 * Verifies the Bearer token and loads the current user.
 * The user is re-read from the database on every request so that a
 * deactivated or role-changed account loses access immediately rather than
 * when its token eventually expires.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication required. Please log in.');
    }
    const payload = verifyToken(header.slice(7).trim());

    const { rows } = await db.query(
      'SELECT id, name, email, role, phone, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user) throw ApiError.unauthorized('Account no longer exists');
    if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Restricts a route to the listed roles. Must run after `authenticate`. */
function authorize(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Administrator access is required for this action'));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
