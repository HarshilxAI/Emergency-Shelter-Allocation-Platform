'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('./ApiError');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn, issuer: 'esap' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, { issuer: 'esap' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Your session has expired. Please log in again.', null, 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }
}

module.exports = { signToken, verifyToken };
