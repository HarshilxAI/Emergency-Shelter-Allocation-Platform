'use strict';

const express = require('express');
const config = require('../config/env');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Emergency Shelter Allocation Platform API',
      version: '1.0.0',
      endpoints: [
        'GET    /api/health',
        'GET    /api/auth/config',
        'POST   /api/auth/register',
        'POST   /api/auth/login',
        'GET    /api/auth/me',
        'GET    /api/shelters',
        'GET    /api/shelters/:id',
        'GET    /api/shelters/reference-data',
        'POST   /api/emergency-requests',
        'GET    /api/emergency-requests',
        'GET    /api/emergency-requests/:id',
        'POST   /api/recommendations/preview',
        'GET    /api/admin/stats',
        'GET    /api/admin/shelters',
        'POST   /api/admin/shelters'
      ],
      routing: { provider: 'OSRM', baseUrl: config.routing.osrmBaseUrl }
    }
  });
});

router.use('/auth', require('./auth.routes'));
router.use('/shelters', require('./shelter.routes'));
router.use('/emergency-requests', require('./request.routes'));
router.use('/recommendations', require('./recommendation.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
