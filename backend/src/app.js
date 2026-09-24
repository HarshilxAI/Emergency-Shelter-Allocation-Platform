'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const db = require('./config/database');
const ApiError = require('./utils/ApiError');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / curl / server-to-server (no Origin header).
      if (!origin) return callback(null, true);
      if (config.cors.origins.includes(origin)) return callback(null, true);
      // A blocked origin is a configuration problem, not a server fault.
      // Returning a plain Error would surface as an opaque 500, so raise a
      // 403 that names the origin and says exactly how to allow it.
      return callback(
        new ApiError(
          403,
          `Origin ${origin} is not allowed. Add it to CORS_ORIGINS in backend/.env ` +
            `(currently: ${config.cors.origins.join(', ')}) and restart the API.`,
          null,
          'CORS_ORIGIN_BLOCKED'
        )
      );
    },
    credentials: true
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (!config.isProduction) app.use(morgan('dev'));

// Global throttle. Generous enough for normal use, low enough to blunt abuse.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests. Please slow down.' } }
  })
);

app.get('/api/health', async (req, res) => {
  try {
    const now = await db.healthCheck();
    res.json({ success: true, data: { status: 'ok', database: 'connected', time: now } });
  } catch (err) {
    res.status(503).json({
      success: false,
      error: { message: 'Database unavailable', code: 'DB_UNAVAILABLE' }
    });
  }
});

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
