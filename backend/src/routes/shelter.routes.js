'use strict';

const express = require('express');
const ctrl = require('../controllers/shelter.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const validateId = require('../middleware/validateId');
const schemas = require('../validators/schemas');

const router = express.Router();

// Shelter information is readable by any signed-in user.
router.get('/reference-data', ctrl.referenceData);
router.get('/', authenticate, validate(schemas.shelterQuerySchema, 'query'), ctrl.list);
router.get('/:id', authenticate, validateId(), ctrl.getOne);

module.exports = router;
