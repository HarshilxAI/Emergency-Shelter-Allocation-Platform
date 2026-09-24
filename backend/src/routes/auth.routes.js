'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const schemas = require('../validators/schemas');

const router = express.Router();

/** Brute-force protection on credential endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many attempts. Please wait a few minutes and try again.' }
  }
});

router.get('/config', ctrl.authConfig);
router.post('/register', authLimiter, validate(schemas.registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(schemas.loginSchema), ctrl.login);
router.post('/google', authLimiter, validate(schemas.googleAuthSchema), ctrl.googleLogin);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, validate(schemas.updateProfileSchema), ctrl.updateProfile);
router.post('/change-password', authenticate, validate(schemas.changePasswordSchema), ctrl.changePassword);

module.exports = router;
