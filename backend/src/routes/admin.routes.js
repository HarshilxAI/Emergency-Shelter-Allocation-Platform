'use strict';

const express = require('express');
const ctrl = require('../controllers/admin.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const validateId = require('../middleware/validateId');
const schemas = require('../validators/schemas');

const router = express.Router();

// Every route below requires a valid token AND the admin role.
router.use(authenticate, authorize('admin'));

router.get('/stats', ctrl.stats);

router.get('/shelters', validate(schemas.shelterQuerySchema, 'query'), ctrl.listShelters);
router.post('/shelters', validate(schemas.createShelterSchema), ctrl.createShelter);
router.patch('/shelters/:id', validateId(), validate(schemas.updateShelterSchema), ctrl.updateShelter);
router.patch('/shelters/:id/occupancy', validateId(), validate(schemas.occupancySchema), ctrl.updateOccupancy);
router.post('/shelters/:id/deactivate', validateId(), ctrl.deactivateShelter);
router.delete('/shelters/:id', validateId(), ctrl.deleteShelter);

// Potential-facility lifecycle: potential -> under_verification -> registered -> activated
router.post(
  '/shelters/:id/under-verification',
  validateId(),
  validate(schemas.verifyFacilitySchema),
  ctrl.markUnderVerification
);
router.post(
  '/shelters/:id/verify',
  validateId(),
  validate(schemas.verifyFacilitySchema),
  ctrl.verifyFacility
);
router.post(
  '/shelters/:id/activate',
  validateId(),
  validate(schemas.activateFacilitySchema),
  ctrl.activateFacility
);
router.post(
  '/shelters/estimate-capacity',
  validate(schemas.estimateCapacitySchema),
  ctrl.estimateCapacity
);

router.get('/requests', validate(schemas.paginationSchema, 'query'), ctrl.listRequests);
router.get('/requests/:id', validateId(), ctrl.getRequest);
router.patch('/requests/:id/status', validateId(), validate(schemas.updateRequestStatusSchema), ctrl.updateRequestStatus);

// Allocation review: "Keep allocation" / "Change shelter"
router.post(
  '/requests/:id/confirm',
  validateId(),
  validate(schemas.confirmAllocationSchema),
  ctrl.confirmAllocation
);
router.post(
  '/requests/:id/reassign',
  validateId(),
  validate(schemas.reassignAllocationSchema),
  ctrl.reassignAllocation
);

router.get('/history', validate(schemas.historyQuerySchema, 'query'), ctrl.listHistory);
router.get('/history/export', ctrl.exportHistory);

router.get('/users', validate(schemas.paginationSchema, 'query'), ctrl.listUsers);
router.patch('/users/:id', validateId(), validate(schemas.updateUserSchema), ctrl.updateUser);

module.exports = router;
