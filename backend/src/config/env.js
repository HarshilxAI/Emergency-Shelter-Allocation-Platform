'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Centralised environment configuration.
 * Fails fast on start-up if a required variable is missing, so the server
 * never runs in a half-configured state.
 */

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        'Copy backend/.env.example to backend/.env and fill it in.'
    );
  }
  return value;
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = process.env.NODE_ENV || 'development';

const jwtSecret = required('JWT_SECRET');
if (NODE_ENV === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  port: toInt(process.env.PORT, 5000),

  db: {
    // DATABASE_URL takes precedence when present (useful for hosted Postgres).
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME || 'esap',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: toInt(process.env.DB_POOL_MAX, 10)
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  },

  google: {
    // Optional. When the client id is absent the API reports
    // googleAuthEnabled:false and the frontend hides the button.
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    get enabled() {
      return Boolean(this.clientId);
    }
  },

  routing: {
    // Public OSRM demo server. Used for real road routing; when it is
    // unreachable the frontend falls back to an external navigation link
    // and says so explicitly — it never fabricates a route.
    osrmBaseUrl: process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'
  },

  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10),

  // Optional second factor for administrator accounts, matching the
  // locked login design's "administrator passkey" flow. When unset,
  // administrator registration and login work as normal — nothing is
  // silently disabled, but no extra secret is required either. Set this
  // in production if administrator accounts need a shared passkey.
  adminPasskey: process.env.ADMIN_PASSKEY || null
};

module.exports = config;
