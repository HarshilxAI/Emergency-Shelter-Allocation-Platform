#!/usr/bin/env node
/**
 * Browser-level verification of the complete user journey.
 * Requires the backend (:5000) and the frontend dev server (:5173).
 *
 *   node scripts/ui-test.mjs
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

// Defaults to the Vite dev server, which is what the README tells you to run.
const BASE = process.env.UI_BASE || 'http://localhost:5173';
const SHOTS = '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
const consoleErrors = [];

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message.split('\n')[0]}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const CHROME =
  process.env.CHROME_PATH ||
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const text = msg.text();
    // Tile requests fail in this sandbox (no network to OSM) — not an app bug.
    if (/tile\.openstreetmap|ERR_|Failed to load resource|router\.project-osrm/i.test(text)) return;
    consoleErrors.push(text);
  }
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

/**
 * Sets a controlled React input. Assigning `.value` directly does not emit
 * the events React listens for, so the component state would keep its old
 * value. Focus, select-all, then type real keystrokes instead.
 */
async function setInput(selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (String(value).length) await page.type(selector, String(value));
}

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

console.log('\nBROWSER UI TEST SUITE');
console.log('='.repeat(60));
console.log('\n[landing & navigation]');

await step('landing page renders the hero', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const h1 = await page.$eval('h1', (el) => el.textContent);
  assert(h1.includes('Find safety'), `unexpected headline: ${h1}`);
  await shot('01-landing');
});

await step('demo-data disclosure is visible on first paint', async () => {
  const notice = await page.$eval('.demo-notice', (el) => el.textContent);
  assert(/fictional/i.test(notice), 'demo disclosure missing');
});

await step('landing page explains the scoring weights', async () => {
  const weights = await page.$$eval('.factor__weight', (els) => els.map((e) => e.textContent));
  assert(weights.length === 5, `expected 5 factors, found ${weights.length}`);
});

console.log('\n[authentication]');

const email = `ui_${Date.now()}@example.com`;

await step('registration rejects a short password inline', async () => {
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle2' });
  await page.type('#field-name', 'UI Tester');
  await page.type('#field-email', email);
  await page.type('#field-password', 'abc');
  await page.type('#field-confirmPassword', 'abc');
  await page.click('button[type=submit]');
  await page.waitForSelector('.field-error', { timeout: 4000 });
  const err = await page.$eval('.field-error', (el) => el.textContent);
  assert(/8 characters/i.test(err), `unexpected error: ${err}`);
});

await step('registration succeeds and lands on the dashboard', async () => {
  await setInput('#field-password', 'Passw0rd123');
  await setInput('#field-confirmPassword', 'Passw0rd123');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type=submit]')
  ]);
  assert(page.url().includes('/dashboard'), `expected dashboard, got ${page.url()}`);
  await shot('02-dashboard');
});

await step('dashboard shows live shelter counts from the API', async () => {
  await page.waitForSelector('.stat__value', { timeout: 8000 });
  const values = await page.$$eval('.stat__value', (els) => els.map((e) => e.textContent.trim()));
  assert(values.length >= 3, 'expected shelter summary stats');
  assert(Number(values[0].replace(/,/g, '')) >= 14, `expected >=14 shelters, got ${values[0]}`);
});

console.log('\n[emergency request flow]');

await step('request form loads with disaster and facility options', async () => {
  await page.goto(`${BASE}/request/new`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name=disasterCode]', { timeout: 8000 });
  const disasters = await page.$$eval('input[name=disasterCode]', (els) => els.length);
  assert(disasters === 6, `expected 6 disaster types, got ${disasters}`);
  const priorities = await page.$$eval('input[name=priority]', (els) => els.length);
  assert(priorities === 4, `expected 4 priorities, got ${priorities}`);
});

await step('form blocks submission when no location is set', async () => {
  // Geolocation is unavailable in this headless run, so the location must
  // still be required rather than silently defaulting.
  await page.click('button[type=submit]');
  await page.waitForSelector('.field-error', { timeout: 4000 });
  const errors = await page.$$eval('.field-error', (els) => els.map((e) => e.textContent));
  assert(
    errors.some((e) => /location/i.test(e)),
    `expected a location error, got: ${errors.join(' | ')}`
  );
});

await step('clicking the map sets a location pin', async () => {
  // The previous step triggers a smooth scroll to the first invalid field.
  // Measure the map only after that animation has settled, or the click
  // coordinates go stale mid-scroll.
  await page.$eval('.leaflet-container', (el) =>
    el.scrollIntoView({ behavior: 'instant', block: 'center' })
  );
  await new Promise((r) => setTimeout(r, 700));
  const map = await page.$('.leaflet-container');
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => document.querySelector('.field-hint')?.textContent.includes('Pin set at'),
    { timeout: 5000 }
  );
});

await step('children count above the total is rejected client-side', async () => {
  await setInput('#field-totalPeople', '4');
  await setInput('#field-childrenCount', '9');
  await page.click('button[type=submit]');
  await page.waitForFunction(
    () => document.querySelector('#field-childrenCount-error') !== null,
    { timeout: 4000 }
  );
});

await step('submitting a valid request returns ranked recommendations', async () => {
  await setInput('#field-childrenCount', '1');
  await setInput('#field-totalPeople', '8');

  // Select a high-priority flood needing medical, food and water.
  await page.click('input[name=priority][value=high]');
  await page.click('input[name=disasterCode][value=flood]');
  const boxes = await page.$$('input[type=checkbox]');
  await boxes[0].click(); // medical
  await boxes[1].click(); // food

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
    page.click('button[type=submit]')
  ]);
  assert(/\/requests\/\d+/.test(page.url()), `expected results page, got ${page.url()}`);
  await shot('03-results');
});

await step('results are ranked with descending suitability scores', async () => {
  await page.waitForSelector('.score-mark__value', { timeout: 8000 });
  const scores = await page.$$eval('.score-mark__value', (els) =>
    els.map((e) => Number(e.textContent.trim()))
  );
  assert(scores.length > 0, 'no scored results rendered');
  for (let i = 1; i < scores.length; i++) {
    assert(scores[i] <= scores[i - 1], `scores not descending: ${scores.join(', ')}`);
  }
  const ranks = await page.$$eval('.rank-mark', (els) => els.map((e) => e.textContent.trim()));
  assert(ranks[0] === '1', 'first result should be rank 1');
});

await step('no full or closed shelter appears in the results', async () => {
  const badges = await page.$$eval('.shelter-record .badge', (els) =>
    els.map((e) => e.textContent.trim())
  );
  assert(!badges.includes('Full'), 'a full shelter was recommended');
  assert(!badges.includes('Temporarily closed'), 'a closed shelter was recommended');
});

await step('score breakdown expands and shows all five factors', async () => {
  const buttons = await page.$$('button');
  let clicked = false;
  for (const b of buttons) {
    const text = await b.evaluate((el) => el.textContent);
    if (text.includes('Why this score')) {
      await b.click();
      clicked = true;
      break;
    }
  }
  assert(clicked, 'no "Why this score?" control found');
  await page.waitForSelector('.breakdown-row', { timeout: 4000 });
  const rows = await page.$$eval('.breakdown-row__name', (els) => els.map((e) => e.textContent));
  for (const factor of ['Distance', 'Capacity', 'Facilities', 'Disaster fit', 'Readiness']) {
    assert(rows.includes(factor), `missing factor "${factor}" in: ${rows.join(', ')}`);
  }
  await shot('04-breakdown');
});

await step('requested facilities are marked met or missing', async () => {
  const met = await page.$$('.chip-met');
  assert(met.length > 0, 'expected at least one met facility chip');
});

console.log('\n[shelter browsing & detail]');

await step('shelter list renders every seeded shelter', async () => {
  await page.goto(`${BASE}/shelters`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.railed', { timeout: 10000 });
  const cards = await page.$$('.railed');
  assert(cards.length >= 14, `expected >=14 shelters, got ${cards.length}`);
  await shot('05-shelters');
});

await step('status filter narrows the list', async () => {
  await page.select('select[aria-label="Filter by status"]', 'full');
  await page.waitForFunction(
    () => document.querySelectorAll('.railed').length <= 3,
    { timeout: 6000 }
  );
  const badges = await page.$$eval('.badge', (els) => els.map((e) => e.textContent.trim()));
  assert(badges.includes('Full'), 'expected a full shelter after filtering');
});

await step('shelter detail page shows capacity and disaster ratings', async () => {
  await page.goto(`${BASE}/shelters/1`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.metric__value', { timeout: 8000 });
  const metrics = await page.$$eval('.metric__label', (els) => els.map((e) => e.textContent));
  assert(metrics.some((m) => /Total capacity/i.test(m)), 'capacity metric missing');
  const ratings = await page.$$('.breakdown-row');
  assert(ratings.length > 0, 'disaster suitability ratings missing');
  await shot('06-shelter-detail');
});

console.log('\n[role-based access]');

await step('a normal user is redirected away from the admin area', async () => {
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  assert(!page.url().includes('/admin'), `user reached admin at ${page.url()}`);
});

await step('admin navigation link is hidden from normal users', async () => {
  const links = await page.$$eval('.nav__link', (els) => els.map((e) => e.textContent));
  assert(!links.includes('Admin'), 'admin link visible to a normal user');
});

console.log('\n[admin flows]');

await step('admin can sign in and reach the operations overview', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  // Use the demo-credential shortcut, which also verifies that control.
  const demoButtons = await page.$$('.demo-creds button');
  await demoButtons[1].click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type=submit]')
  ]);
  assert(page.url().includes('/admin'), `expected /admin, got ${page.url()}`);
  await shot('07-admin-dashboard');
});

await step('admin dashboard reports network capacity', async () => {
  await page.waitForSelector('.stat__value', { timeout: 8000 });
  const stats = await page.$$eval('.stat__value', (els) => els.map((e) => e.textContent.trim()));
  assert(stats.length >= 8, `expected 8 stat tiles, got ${stats.length}`);
  const bar = await page.$('.capacity-bar__fill');
  assert(bar, 'capacity bar missing');
});

await step('admin shelter table loads with management controls', async () => {
  await page.goto(`${BASE}/admin/shelters`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('tbody tr', { timeout: 10000 });
  const rows = await page.$$('tbody tr');
  assert(rows.length >= 14, `expected >=14 rows, got ${rows.length}`);
  await shot('08-admin-shelters');
});

await step('inline occupancy editing saves and updates the row', async () => {
  const link = await page.$('tbody tr .inline-link');
  const before = await link.evaluate((el) => el.textContent.trim());
  await link.click();
  await page.waitForSelector('tbody input[type=number]', { timeout: 4000 });

  const current = Number(before.split('/')[0].trim());
  const next = current > 0 ? current - 1 : 1;
  await setInput('tbody input[type=number]', String(next));

  const buttons = await page.$$('tbody button');
  for (const b of buttons) {
    const t = await b.evaluate((el) => el.textContent);
    if (t.trim() === 'Save') {
      await b.click();
      break;
    }
  }
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('tbody tr .inline-link');
      return el && el.textContent.trim().startsWith(String(expected));
    },
    { timeout: 8000 },
    next
  );
});

await step('admin can open the add-shelter form', async () => {
  await page.goto(`${BASE}/admin/shelters/new`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#field-name', { timeout: 8000 });
  const derived = await page.$eval('.alert-info', (el) => el.textContent);
  assert(/status/i.test(derived), 'derived status preview missing');
  await shot('09-admin-shelter-form');
});

await step('add-shelter form validates before submitting', async () => {
  await page.click('button[type=submit]');
  await page.waitForSelector('.field-error', { timeout: 4000 });
  const errors = await page.$$eval('.field-error', (els) => els.map((e) => e.textContent));
  assert(errors.length > 0, 'expected validation errors on an empty form');
});

await step('admin can create a shelter end to end', async () => {
  await page.type('#field-name', 'Browser Test Shelter');
  await page.type('#field-address', '12 Verification Road, Bengaluru');
  await setInput('#field-totalCapacity', '250');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type=submit]')
  ]);
  assert(page.url().endsWith('/admin/shelters'), `expected shelter list, got ${page.url()}`);
  await page.waitForSelector('tbody tr', { timeout: 8000 });
  const html = await page.content();
  assert(html.includes('Browser Test Shelter'), 'new shelter not listed');
});

await step('admin requests table lists the user request', async () => {
  await page.goto(`${BASE}/admin/requests`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('tbody tr', { timeout: 10000 });
  const rows = await page.$$('tbody tr');
  assert(rows.length >= 1, 'expected at least one request');
  await shot('10-admin-requests');
});

await step('admin can open a request and see its recommendations', async () => {
  const link = await page.$('tbody tr a.btn');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    link.click()
  ]);
  await page.waitForSelector('.metric__value', { timeout: 8000 });
  assert(/\/admin\/requests\/\d+/.test(page.url()), `unexpected url ${page.url()}`);
});

await step('admin users page lists accounts without exposing secrets', async () => {
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('tbody tr', { timeout: 10000 });
  const body = await page.$eval('main', (el) => el.textContent);
  assert(!/\$2[aby]\$/.test(body), 'a bcrypt hash leaked into the users page');
  assert(!/password/i.test(body), 'password text rendered in the users table');
  const apiPayload = await page.evaluate(async () => {
    const res = await fetch('/api/admin/users?limit=5', {
      headers: { Authorization: `Bearer ${localStorage.getItem('esap.token')}` }
    });
    return JSON.stringify(await res.json());
  });
  assert(!/password|phone/i.test(apiPayload), `sensitive field in API payload: ${apiPayload.slice(0, 200)}`);
  const self = await page.$$eval('tbody tr', (rows) =>
    rows.some((r) => r.textContent.includes('Cannot edit own account'))
  );
  assert(self, 'the signed-in admin should not be editable');
  await shot('11-admin-users');
});

console.log('\n[responsive & resilience]');

await step('mobile viewport renders the nav toggle and stacks content', async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const toggleVisible = await page.$eval('.nav__toggle', (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none';
  });
  assert(toggleVisible, 'mobile nav toggle should be visible');
  await shot('12-mobile-landing');
});

await step('mobile menu opens when toggled', async () => {
  await page.click('.nav__toggle');
  await page.waitForFunction(
    () => document.querySelector('.nav__links')?.classList.contains('is-open'),
    { timeout: 3000 }
  );
});

await step('no horizontal overflow on a phone-width results page', async () => {
  await page.goto(`${BASE}/requests`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 900));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert(overflow <= 2, `page overflows horizontally by ${overflow}px`);
  await shot('13-mobile-requests');
});

await step('unknown routes show the not-found page', async () => {
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(`${BASE}/no-such-page`, { waitUntil: 'networkidle2' });
  const text = await page.$eval('.empty h3', (el) => el.textContent);
  assert(/does not exist/i.test(text), `unexpected copy: ${text}`);
});

await step('signing out clears the session and protects routes', async () => {
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2' });
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const t = await b.evaluate((el) => el.textContent);
    if (t.includes('Sign out')) {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 1200));
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  assert(page.url().includes('/login'), `expected redirect to login, got ${page.url()}`);
});

await step('no unexpected console errors across the whole run', async () => {
  assert(
    consoleErrors.length === 0,
    `console errors:\n        ${consoleErrors.slice(0, 5).join('\n        ')}`
  );
});

await browser.close();

console.log('\n' + '='.repeat(60));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log(`Screenshots: ${SHOTS}`);
console.log('='.repeat(60) + '\n');
process.exit(failed > 0 ? 1 : 0);
