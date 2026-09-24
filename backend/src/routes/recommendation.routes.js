'use strict';

const express = require('express');
const ctrl = require('../controllers/request.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const schemas = require('../validators/schemas');

const router = express.Router();

/**
 * Stateless scoring preview. Same engine as POST /api/emergency-requests,
 * but nothing is written to the database.
 */
router.post('/preview', authenticate, validate(schemas.previewSchema), ctrl.preview);

module.exports = router;
