'use strict';

const app = require('./app');
const config = require('./config/env');
const db = require('./config/database');

async function start() {
  // Fail loudly at boot rather than on the first user request.
  try {
    await db.healthCheck();
    console.log(`[db] connected to ${config.db.database}`);
  } catch (err) {
    console.error('\n[db] FAILED TO CONNECT:', err.message);
    console.error('     Check that PostgreSQL is running and backend/.env is correct.');
    console.error('     Run `npm run db:reset` to create the schema and seed data.\n');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
    console.log(`[api] environment: ${config.nodeEnv}`);
    console.log(`[api] google auth: ${config.google.enabled ? 'enabled' : 'disabled (no client id)'}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(() => db.pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
