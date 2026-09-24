'use strict';

const express = require('express');
const ctrl = require('../controllers/request.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const validateId = require('../middleware/validateId');
const schemas = require('../validators/schemas');

const router = express.Router();

router.use(authenticate);

router.post('/', validate(schemas.emergencyRequestSchema), ctrl.create);
router.get('/', validate(schemas.paginationSchema, 'query'), ctrl.listMine);
router.get('/:id', validateId(), ctrl.getOne);
router.post('/:id/cancel', validateId(), ctrl.cancel);

module.exports = router;
