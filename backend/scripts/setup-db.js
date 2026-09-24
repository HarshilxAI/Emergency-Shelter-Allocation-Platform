#!/usr/bin/env node
'use strict';

/**
 * Creates the database (if missing) and applies the schema.
 * Usage: npm run db:setup
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config/env');

const SCHEMA_DIR = path.resolve(__dirname, '../../database/schema');

async function ensureDatabase() {
  // Connect to the maintenance database to create the target one.
  const admin = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: 'postgres',
    ssl: config.db.ssl
  });

  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    config.db.database
  ]);
  if (rows.length === 0) {
    // Identifier cannot be parameterised; it comes from config, not user input.
    await admin.query(`CREATE DATABASE "${config.db.database.replace(/"/g, '""')}"`);
    console.log(`[setup] created database "${config.db.database}"`);
  } else {
    console.log(`[setup] database "${config.db.database}" already exists`);
  }
  await admin.end();
}

async function applySchema() {
  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl
  });
  await client.connect();

  const files = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.sql') && !f.includes('postgis'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
    await client.query(sql);
    console.log(`[setup] applied ${file}`);
  }
  await client.end();
}

(async () => {
  try {
    await ensureDatabase();
    await applySchema();
    console.log('[setup] schema ready. Run `npm run db:seed` to load demo data.');
    process.exit(0);
  } catch (err) {
    console.error('[setup] failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('        Is PostgreSQL running on ' + config.db.host + ':' + config.db.port + '?');
    }
    process.exit(1);
  }
})();
