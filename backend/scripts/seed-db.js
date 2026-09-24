#!/usr/bin/env node
'use strict';

/**
 * Loads reference data, demo shelters and demo accounts.
 * Safe to re-run: existing rows are left alone.
 * Usage: npm run db:seed
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const config = require('../src/config/env');

const SEED_DIR = path.resolve(__dirname, '../../database/seeds');

// Development credentials only. Documented in the README and intended purely
// for local evaluation of this academic project — change them before any
// real deployment.
const DEMO_ACCOUNTS = [
  {
    name: 'Demo Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'demo.admin@esap.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'DemoAdmin@123',
    role: 'admin',
    phone: '99999-00001'
  },
  {
    name: 'Demo User',
    email: process.env.SEED_USER_EMAIL || 'demo.user@esap.local',
    password: process.env.SEED_USER_PASSWORD || 'DemoUser@123',
    role: 'user',
    phone: '99999-00002'
  }
];

async function main() {
  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl
  });
  await client.connect();

  const { rows: shelterCount } = await client.query('SELECT COUNT(*)::int AS n FROM shelters');
  if (shelterCount[0].n > 0) {
    console.log(`[seed] ${shelterCount[0].n} shelters already present, skipping shelter seed`);
  }

  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (file.includes('demo_shelters') && shelterCount[0].n > 0) continue;
    const sql = fs.readFileSync(path.join(SEED_DIR, file), 'utf8');
    await client.query(sql);
    console.log(`[seed] applied ${file}`);
  }

  for (const account of DEMO_ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, config.bcryptRounds);
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      [account.name, account.email, hash, account.role, account.phone]
    );
    console.log(`[seed] account ready: ${account.email} (${account.role})`);
  }

  const summary = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM shelters)           AS shelters,
      (SELECT COUNT(*)::int FROM users)              AS users,
      (SELECT COUNT(*)::int FROM facilities)         AS facilities,
      (SELECT COUNT(*)::int FROM disaster_types)     AS disasters`);
  console.log('[seed] done:', summary.rows[0]);
  console.log('\n  DEVELOPMENT CREDENTIALS (demo only — do not use in production)');
  for (const a of DEMO_ACCOUNTS) console.log(`    ${a.role.padEnd(5)}  ${a.email}  ${a.password}`);
  console.log('');

  await client.end();
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
