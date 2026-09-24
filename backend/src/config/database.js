'use strict';

const { Pool } = require('pg');
const config = require('./env');

/**
 * A single shared pool for the process. All queries are parameterised —
 * no SQL string is ever built from user input.
 */
const pool = new Pool(
  config.db.connectionString
    ? { connectionString: config.db.connectionString, ssl: config.db.ssl, max: config.db.max }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
        ssl: config.db.ssl,
        max: config.db.max
      }
);

pool.on('error', (err) => {
  // An idle client failed (e.g. database restarted). Log and let pg recover;
  // crashing the API here would take down healthy requests too.
  console.error('[db] unexpected idle client error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0].now;
}

module.exports = { pool, query, withTransaction, healthCheck };
