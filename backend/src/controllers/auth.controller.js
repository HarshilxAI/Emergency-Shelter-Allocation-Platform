'use strict';

const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const config = require('../config/env');

exports.register = asyncHandler(async (req, res) => {
  const { user, token, adminRequestDenied } = await authService.register(req.body);
  res.status(201).json({ success: true, data: { user, token, adminRequestDenied } });
});

exports.login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.json({ success: true, data: { user, token } });
});

exports.googleLogin = asyncHandler(async (req, res) => {
  const { user, token } = await authService.googleLogin(req.body);
  res.json({ success: true, data: { user, token } });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.json({ success: true, data: { user } });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  res.json({ success: true, data: { user } });
});

exports.changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  res.json({ success: true, data: { message: 'Password updated successfully' } });
});

/**
 * Logout is client-side for stateless JWT: the frontend discards the token.
 * The endpoint exists so the client has a single place to call and so a
 * future token-blacklist implementation has a home.
 */
exports.logout = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { message: 'Logged out. Please discard your token.' } });
});

/**
 * Tells the frontend which optional auth features are actually configured
 * on this server — Google sign-in and the administrator passkey — so the
 * UI never offers a control that cannot work.
 */
exports.authConfig = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      googleAuthEnabled: config.google.enabled,
      googleClientId: config.google.clientId,
      adminPasskeyEnabled: Boolean(config.adminPasskey)
    }
  });
});
