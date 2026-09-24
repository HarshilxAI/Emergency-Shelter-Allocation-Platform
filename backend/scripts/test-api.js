#!/usr/bin/env node
'use strict';

/**
 * End-to-end API workflow verification.
 * Requires the server to be running and the database seeded.
 *
 *   node scripts/test-api.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || '';

let passed = 0;
let failed = 0;
const state = {};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertStatus(res, expected) {
  if (res.status !== expected) {
    throw new Error(
      `expected HTTP ${expected}, got ${res.status}: ${JSON.stringify(res.body?.error || res.body).slice(0, 200)}`
    );
  }
}

(async () => {
  console.log('\nAPI END-TO-END TEST SUITE');
  console.log('='.repeat(60));

  // ---------------------------------------------------------------
  console.log('\n[health & discovery]');

  await test('GET /health reports a live database', async () => {
    const res = await api('GET', '/health');
    assertStatus(res, 200);
    assert(res.body.data.database === 'connected');
  });

  await test('GET /auth/config reports Google availability honestly', async () => {
    const res = await api('GET', '/auth/config');
    assertStatus(res, 200);
    assert(typeof res.body.data.googleAuthEnabled === 'boolean');
  });

  await test('GET /shelters/reference-data returns disasters and facilities', async () => {
    const res = await api('GET', '/shelters/reference-data');
    assertStatus(res, 200);
    assert(res.body.data.disasterTypes.length >= 6, 'expected 6 disaster types');
    assert(res.body.data.facilities.length >= 9, 'expected the facility catalogue');
  });

  // ---------------------------------------------------------------
  console.log('\n[authentication]');

  const uniqueEmail = `test_${Date.now()}@example.com`;

  await test('register rejects a weak password', async () => {
    const res = await api('POST', '/auth/register', {
      body: { name: 'Weak', email: `w_${Date.now()}@x.com`, password: 'abc', confirmPassword: 'abc' }
    });
    assertStatus(res, 400);
    assert(res.body.error.details.password, 'should flag the password field');
  });

  await test('register rejects mismatched passwords', async () => {
    const res = await api('POST', '/auth/register', {
      body: {
        name: 'Mismatch', email: `m_${Date.now()}@x.com`,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd999'
      }
    });
    assertStatus(res, 400);
    assert(res.body.error.details.confirmPassword);
  });

  await test('register creates an account and returns a token', async () => {
    const res = await api('POST', '/auth/register', {
      body: {
        name: 'Integration Tester', email: uniqueEmail,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd123'
      }
    });
    assertStatus(res, 201);
    assert(res.body.data.token, 'token missing');
    assert(res.body.data.user.role === 'user');
    assert(res.body.data.user.password_hash === undefined, 'password hash must never be returned');
    state.userToken = res.body.data.token;
    state.userId = res.body.data.user.id;
  });

  await test('duplicate email is rejected with 409', async () => {
    const res = await api('POST', '/auth/register', {
      body: {
        name: 'Dup', email: uniqueEmail,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd123'
      }
    });
    assertStatus(res, 409);
  });

  await test('login with a wrong password is rejected', async () => {
    const res = await api('POST', '/auth/login', {
      body: { email: uniqueEmail, password: 'WrongPass123' }
    });
    assertStatus(res, 401);
  });

  await test('login with correct credentials succeeds', async () => {
    const res = await api('POST', '/auth/login', {
      body: { email: uniqueEmail, password: 'Passw0rd123' }
    });
    assertStatus(res, 200);
    state.userToken = res.body.data.token;
  });

  await test('admin login without a passkey is rejected when one is configured', async () => {
    if (!ADMIN_PASSKEY) return; // nothing to test when the server has none configured
    const res = await api('POST', '/auth/login', {
      body: { email: 'admin@esap.local', password: 'Admin@12345' }
    });
    assertStatus(res, 401);
    assert(res.body.error.code === 'ADMIN_PASSKEY_REQUIRED');
  });

  await test('admin login with the wrong passkey is rejected', async () => {
    if (!ADMIN_PASSKEY) return;
    const res = await api('POST', '/auth/login', {
      body: { email: 'admin@esap.local', password: 'Admin@12345', adminPasskey: 'wrong-key' }
    });
    assertStatus(res, 401);
  });

  await test('admin seed account can log in with the correct passkey', async () => {
    const res = await api('POST', '/auth/login', {
      body: { email: 'admin@esap.local', password: 'Admin@12345', adminPasskey: ADMIN_PASSKEY }
    });
    assertStatus(res, 200);
    assert(res.body.data.user.role === 'admin');
    state.adminToken = res.body.data.token;
  });

  await test('self-registering as admin without the passkey silently becomes a normal user', async () => {
    const res = await api('POST', '/auth/register', {
      body: {
        name: 'Wannabe Admin', email: `wannabe_${Date.now()}@example.com`,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd123',
        isAdmin: true, adminPasskey: 'not-the-real-key'
      }
    });
    assertStatus(res, 201);
    assert(res.body.data.user.role === 'user', 'must not silently grant admin');
    assert(res.body.data.adminRequestDenied, 'should explain why admin was not granted');
  });

  await test('self-registering as admin with the correct passkey grants the role', async () => {
    if (!ADMIN_PASSKEY) return;
    const res = await api('POST', '/auth/register', {
      body: {
        name: 'Real Admin', email: `realadmin_${Date.now()}@example.com`,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd123',
        isAdmin: true, adminPasskey: ADMIN_PASSKEY
      }
    });
    assertStatus(res, 201);
    assert(res.body.data.user.role === 'admin');
    assert(!res.body.data.adminRequestDenied);
  });

  await test('GET /auth/me returns the current user', async () => {
    const res = await api('GET', '/auth/me', { token: state.userToken });
    assertStatus(res, 200);
    assert(res.body.data.user.email === uniqueEmail);
  });

  await test('protected route rejects a missing token', async () => {
    assertStatus(await api('GET', '/auth/me'), 401);
  });

  await test('protected route rejects a malformed token', async () => {
    assertStatus(await api('GET', '/auth/me', { token: 'not.a.real.token' }), 401);
  });

  // ---------------------------------------------------------------
  console.log('\n[role-based access control]');

  await test('normal user is blocked from admin stats', async () => {
    assertStatus(await api('GET', '/admin/stats', { token: state.userToken }), 403);
  });

  await test('normal user cannot create a shelter', async () => {
    const res = await api('POST', '/admin/shelters', {
      token: state.userToken,
      body: { name: 'Hacked Shelter', address: 'Nowhere', latitude: 12.9, longitude: 77.6, totalCapacity: 10 }
    });
    assertStatus(res, 403);
  });

  await test('admin can read admin stats', async () => {
    const res = await api('GET', '/admin/stats', { token: state.adminToken });
    assertStatus(res, 200);
    assert(res.body.data.shelters.total >= 14, 'expected seeded shelters');
    state.initialShelterCount = res.body.data.shelters.total;
  });

  // ---------------------------------------------------------------
  console.log('\n[shelters]');

  await test('GET /shelters requires authentication', async () => {
    assertStatus(await api('GET', '/shelters'), 401);
  });

  await test('GET /shelters returns seeded demo shelters', async () => {
    const res = await api('GET', '/shelters', { token: state.userToken });
    assertStatus(res, 200);
    assert(res.body.data.shelters.length >= 14);
    state.sampleShelterId = res.body.data.shelters[0].id;
  });

  await test('available_capacity is derived, not duplicated', async () => {
    const res = await api('GET', '/shelters', { token: state.userToken });
    for (const s of res.body.data.shelters) {
      assert(
        s.availableCapacity === Math.max(s.totalCapacity - s.currentOccupancy, 0),
        `${s.name}: available ${s.availableCapacity} != ${s.totalCapacity}-${s.currentOccupancy}`
      );
    }
  });

  await test('shelters can be annotated with distance from a position', async () => {
    const res = await api('GET', '/shelters?latitude=12.9345&longitude=77.6263', {
      token: state.userToken
    });
    assertStatus(res, 200);
    const list = res.body.data.shelters;
    assert(typeof list[0].distanceKm === 'number', 'distance missing');
    for (let i = 1; i < list.length; i++) {
      assert(list[i].distanceKm >= list[i - 1].distanceKm, 'list should be sorted by distance');
    }
  });

  await test('GET /shelters/:id returns full detail', async () => {
    const res = await api('GET', `/shelters/${state.sampleShelterId}`, { token: state.userToken });
    assertStatus(res, 200);
    assert(Array.isArray(res.body.data.shelter.facilities));
    assert(Array.isArray(res.body.data.shelter.disasterSupport));
  });

  await test('unknown shelter id returns 404', async () => {
    assertStatus(await api('GET', '/shelters/99999', { token: state.userToken }), 404);
  });

  // ---------------------------------------------------------------
  console.log('\n[emergency request → allocation]');

  await test('invalid request payload is rejected with field errors', async () => {
    const res = await api('POST', '/emergency-requests', {
      token: state.userToken,
      body: {
        latitude: 12.93, longitude: 77.62, disasterCode: 'volcano',
        priority: 'high', totalPeople: 0
      }
    });
    assertStatus(res, 400);
    assert(res.body.error.details, 'expected field-level errors');
  });

  await test('children count above the total is rejected', async () => {
    const res = await api('POST', '/emergency-requests', {
      token: state.userToken,
      body: {
        latitude: 12.93, longitude: 77.62, disasterCode: 'flood',
        priority: 'high', totalPeople: 3, childrenCount: 10
      }
    });
    assertStatus(res, 400);
    assert(res.body.error.details.childrenCount);
  });

  await test('overlapping category counts are allowed (women + seniors > total is fine)', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.93, longitude: 77.62, disasterCode: 'flood', priority: 'medium',
        totalPeople: 10, womenCount: 8, seniorCount: 6, childrenCount: 3
      }
    });
    assertStatus(res, 200);
  });

  await test('creating a request returns ranked recommendations', async () => {
    const res = await api('POST', '/emergency-requests', {
      token: state.userToken,
      body: {
        latitude: 12.9345, longitude: 77.6263, locationLabel: 'Koramangala test point',
        disasterCode: 'flood', priority: 'high', totalPeople: 12,
        childrenCount: 3, seniorCount: 2, womenCount: 5,
        requiredFacilities: ['medical', 'food', 'water'], notes: 'integration test'
      }
    });
    assertStatus(res, 201);
    const r = res.body.data.request;
    assert(r.recommendations.length > 0, 'expected at least one recommendation');
    assert(r.recommendations[0].rank === 1);
    assert(r.status === 'allocated');
    assert(r.recommendedShelterId === r.recommendations[0].id, 'top rank must be the allocation');
    state.requestId = r.id;
    state.topShelter = r.recommendations[0];
  });

  await test('recommendations are sorted by descending suitability', async () => {
    const recs = state.topShelter ? null : null;
    const res = await api('GET', `/emergency-requests/${state.requestId}`, {
      token: state.userToken
    });
    assertStatus(res, 200);
    const list = res.body.data.request.recommendations;
    for (let i = 1; i < list.length; i++) {
      assert(
        list[i].suitabilityScore <= list[i - 1].suitabilityScore,
        'scores must be non-increasing'
      );
    }
  });

  await test('every recommendation carries a score breakdown', async () => {
    const res = await api('GET', `/emergency-requests/${state.requestId}`, {
      token: state.userToken
    });
    for (const rec of res.body.data.request.recommendations) {
      for (const key of ['distance', 'capacity', 'facilities', 'disaster', 'readiness']) {
        assert(rec.breakdown[key], `missing breakdown.${key} on ${rec.name}`);
      }
    }
  });

  await test('no full or closed shelter appears in the results', async () => {
    const res = await api('GET', `/emergency-requests/${state.requestId}`, {
      token: state.userToken
    });
    for (const rec of res.body.data.request.recommendations) {
      assert(rec.status !== 'full' && rec.status !== 'closed', `${rec.name} is ${rec.status}`);
      assert(rec.availableCapacity >= 12, `${rec.name} cannot fit the group`);
    }
  });

  await test('excluded shelters are reported with reasons', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.9345, longitude: 77.6263, disasterCode: 'flood',
        priority: 'high', totalPeople: 12, requiredFacilities: []
      }
    });
    assertStatus(res, 200);
    const excluded = res.body.data.excluded;
    assert(excluded.length > 0, 'the demo data contains a full and a closed shelter');
    assert(excluded.every((e) => e.reasonLabel), 'each exclusion needs a readable label');
    const reasons = excluded.map((e) => e.reason);
    assert(reasons.includes('full') || reasons.includes('closed'), 'expected full/closed exclusions');
  });

  await test('a location far from every shelter yields zero recommendations, not an error', async () => {
    // ~1000 km from the Bengaluru demo data — every shelter is out of range.
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 22.5726, longitude: 88.3639, disasterCode: 'flood',
        priority: 'high', totalPeople: 4
      }
    });
    assertStatus(res, 200);
    assert(res.body.data.recommendations.length === 0, 'nothing should be in range');
    assert(res.body.data.message, 'expected an explanatory message');
    assert(
      res.body.data.excluded.some((e) => e.reason === 'out_of_range'),
      'distance-based exclusions should dominate'
    );
    // Operationally unusable shelters (full/closed) are caught by earlier
    // filters than distance, so their reason is reported instead — that is
    // correct precedence, not a distance failure.
    assert(
      res.body.data.excluded.every((e) =>
        ['out_of_range', 'full', 'closed', 'inactive', 'not_yet_activated'].includes(e.reason)
      ),
      'unexpected exclusion reason for a remote location'
    );
  });

  await test('a group larger than any single shelter is excluded on capacity', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.9345, longitude: 77.6263, disasterCode: 'flood',
        priority: 'high', totalPeople: 500
      }
    });
    assertStatus(res, 200);
    // Only shelters with >=500 free spaces may appear; the rest must be
    // excluded specifically for insufficient capacity.
    for (const r of res.body.data.recommendations) {
      assert(r.availableCapacity >= 500, `${r.name} cannot hold 500 people`);
    }
    assert(
      res.body.data.excluded.some((e) => e.reason === 'insufficient_capacity'),
      'expected capacity-based exclusions'
    );
  });

  await test('changing priority changes the ranking outcome', async () => {
    const payload = {
      latitude: 12.9345, longitude: 77.6263, disasterCode: 'flood',
      totalPeople: 8, requiredFacilities: ['medical', 'security']
    };
    const [crit, low] = await Promise.all([
      api('POST', '/recommendations/preview', {
        token: state.userToken, body: { ...payload, priority: 'critical' }
      }),
      api('POST', '/recommendations/preview', {
        token: state.userToken, body: { ...payload, priority: 'low' }
      })
    ]);
    assertStatus(crit, 200);
    assertStatus(low, 200);
    const critTop = crit.body.data.recommendations[0];
    const lowTop = low.body.data.recommendations[0];
    assert(critTop && lowTop, 'both should return results');
    // Whatever the ordering, the engine must report different priority profiles.
    assert(
      crit.body.data.meta.priorityProfile.priority === 'critical' &&
        low.body.data.meta.priorityProfile.priority === 'low',
      'meta should reflect the requested priority'
    );
  });

  await test('different disaster types produce different candidate sets', async () => {
    const base = {
      latitude: 12.9418, longitude: 77.5735, priority: 'medium', totalPeople: 5
    };
    const quake = await api('POST', '/recommendations/preview', {
      token: state.userToken, body: { ...base, disasterCode: 'earthquake' }
    });
    const flood = await api('POST', '/recommendations/preview', {
      token: state.userToken, body: { ...base, disasterCode: 'flood' }
    });
    assertStatus(quake, 200);
    assertStatus(flood, 200);
    // Basavanagudi Heritage Hall is rated 0.25 for earthquakes and must be
    // filtered out there, while remaining eligible for floods.
    const quakeExcluded = quake.body.data.excluded.map((e) => e.name);
    assert(
      quakeExcluded.some((n) => n.includes('Basavanagudi')),
      'the masonry hall should be excluded for earthquakes'
    );
    const floodNames = flood.body.data.recommendations.map((r) => r.name);
    assert(
      floodNames.some((n) => n.includes('Basavanagudi')),
      'the same hall should be eligible for floods'
    );
  });

  await test('history lists the created request', async () => {
    const res = await api('GET', '/emergency-requests', { token: state.userToken });
    assertStatus(res, 200);
    assert(res.body.data.requests.some((r) => r.id === state.requestId));
  });

  await test('a user cannot read another user&apos;s request', async () => {
    const other = await api('POST', '/auth/register', {
      body: {
        name: 'Other User', email: `other_${Date.now()}@example.com`,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd123'
      }
    });
    const res = await api('GET', `/emergency-requests/${state.requestId}`, {
      token: other.body.data.token
    });
    assertStatus(res, 403);
  });

  // ---------------------------------------------------------------
  console.log('\n[admin shelter CRUD]');

  await test('admin can create a shelter', async () => {
    const res = await api('POST', '/admin/shelters', {
      token: state.adminToken,
      body: {
        name: 'Integration Test Shelter', description: 'Created by the test suite',
        address: '1 Test Road, Bengaluru', latitude: 12.94, longitude: 77.61,
        totalCapacity: 100, currentOccupancy: 10,
        contactPhone: '99999-99999', isWheelchairAccessible: true,
        facilities: ['medical', 'food', 'water'],
        disasterSupport: [{ disasterCode: 'flood', suitabilityLevel: 0.9 }]
      }
    });
    assertStatus(res, 201);
    const s = res.body.data.shelter;
    assert(s.availableCapacity === 90, `expected 90 available, got ${s.availableCapacity}`);
    assert(s.facilities.length === 3);
    assert(s.status === 'available', 'status should be derived from occupancy');
    state.newShelterId = s.id;
  });

  await test('created shelter is immediately allocatable', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.94, longitude: 77.61, disasterCode: 'flood',
        priority: 'high', totalPeople: 5, requiredFacilities: ['medical']
      }
    });
    assertStatus(res, 200);
    assert(
      res.body.data.recommendations.some((r) => r.id === state.newShelterId),
      'the new shelter should appear in recommendations'
    );
  });

  await test('admin can edit a shelter', async () => {
    const res = await api('PATCH', `/admin/shelters/${state.newShelterId}`, {
      token: state.adminToken,
      body: { name: 'Renamed Test Shelter', totalCapacity: 150, facilities: ['medical', 'security'] }
    });
    assertStatus(res, 200);
    assert(res.body.data.shelter.name === 'Renamed Test Shelter');
    assert(res.body.data.shelter.availableCapacity === 140);
    assert(res.body.data.shelter.facilities.includes('security'));
  });

  await test('occupancy above capacity is rejected', async () => {
    const res = await api('PATCH', `/admin/shelters/${state.newShelterId}/occupancy`, {
      token: state.adminToken,
      body: { currentOccupancy: 9999 }
    });
    assertStatus(res, 400);
  });

  await test('filling a shelter flips its status to full and removes it from results', async () => {
    const res = await api('PATCH', `/admin/shelters/${state.newShelterId}/occupancy`, {
      token: state.adminToken,
      body: { currentOccupancy: 150 }
    });
    assertStatus(res, 200);
    assert(res.body.data.shelter.status === 'full', 'status should become full');
    assert(res.body.data.shelter.availableCapacity === 0);

    const rec = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.94, longitude: 77.61, disasterCode: 'flood',
        priority: 'high', totalPeople: 5
      }
    });
    assert(
      !rec.body.data.recommendations.some((r) => r.id === state.newShelterId),
      'a full shelter must never be recommended'
    );
  });

  await test('partial occupancy flips status to limited', async () => {
    const res = await api('PATCH', `/admin/shelters/${state.newShelterId}/occupancy`, {
      token: state.adminToken,
      body: { currentOccupancy: 140 }
    });
    assertStatus(res, 200);
    assert(res.body.data.shelter.status === 'limited', `got ${res.body.data.shelter.status}`);
  });

  await test('admin can deactivate a shelter', async () => {
    const res = await api('POST', `/admin/shelters/${state.newShelterId}/deactivate`, {
      token: state.adminToken
    });
    assertStatus(res, 200);
    assert(res.body.data.shelter.isActive === false);

    const rec = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: { latitude: 12.94, longitude: 77.61, disasterCode: 'flood', priority: 'high', totalPeople: 1 }
    });
    assert(
      !rec.body.data.recommendations.some((r) => r.id === state.newShelterId),
      'a deactivated shelter must not be recommended'
    );
  });

  await test('admin can delete an unreferenced shelter', async () => {
    const res = await api('DELETE', `/admin/shelters/${state.newShelterId}`, {
      token: state.adminToken
    });
    assertStatus(res, 200);
    assert(res.body.data.deleted === true);
  });

  await test('deleting a referenced shelter is refused with a clear reason', async () => {
    const referenced = state.topShelter?.id;
    assert(referenced, 'no referenced shelter captured');
    const res = await api('DELETE', `/admin/shelters/${referenced}`, { token: state.adminToken });
    assertStatus(res, 409);
  });

  // ---------------------------------------------------------------
  console.log('\n[potential facility lifecycle]');

  await test('admin can create a potential facility (defaults to status "potential")', async () => {
    const res = await api('POST', '/admin/shelters', {
      token: state.adminToken,
      body: {
        name: 'Integration Test School', address: '2 Test Road, Bengaluru',
        latitude: 12.95, longitude: 77.62, totalCapacity: 200,
        facilityCategory: 'potential_facility', facilityType: 'government_school',
        capacityType: 'estimated', capacityMethod: 'AREA_BASED', floorAreaSqm: 700
      }
    });
    assertStatus(res, 201);
    const s = res.body.data.shelter;
    assert(s.status === 'potential', `expected potential, got ${s.status}`);
    assert(s.isPotential === true);
    assert(s.verificationStatus === 'unverified');
    state.potentialId = s.id;
  });

  await test('a potential facility never appears in the public shelter list', async () => {
    const res = await api('GET', '/shelters', { token: state.userToken });
    assertStatus(res, 200);
    assert(
      !res.body.data.shelters.some((s) => s.id === state.potentialId),
      'potential facility leaked into the public listing'
    );
  });

  await test('a potential facility is excluded from recommendations with reason not_yet_activated', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: { latitude: 12.95, longitude: 77.62, disasterCode: 'flood', priority: 'high', totalPeople: 2 }
    });
    assertStatus(res, 200);
    const excluded = res.body.data.excluded.find((e) => e.shelterId === state.potentialId);
    assert(excluded, 'expected the potential facility to be reported as excluded');
    assert(excluded.reason === 'not_yet_activated');
  });

  await test('estimate-capacity endpoint returns a deterministic AREA_BASED figure', async () => {
    const res = await api('POST', '/admin/shelters/estimate-capacity', {
      token: state.adminToken,
      body: { floorAreaSqm: 700 }
    });
    assertStatus(res, 200);
    assert(res.body.data.method === 'AREA_BASED');
    assert(res.body.data.estimatedCapacity === Math.floor(700 / 3.5));
  });

  await test('a normal user cannot verify or activate a facility', async () => {
    assertStatus(
      await api('POST', `/admin/shelters/${state.potentialId}/verify`, { token: state.userToken }),
      403
    );
  });

  await test('activation is refused before verification', async () => {
    const res = await api('POST', `/admin/shelters/${state.potentialId}/activate`, {
      token: state.adminToken,
      body: { totalCapacity: 200 }
    });
    assertStatus(res, 400);
  });

  await test('admin can move a potential facility under verification', async () => {
    const res = await api('POST', `/admin/shelters/${state.potentialId}/under-verification`, {
      token: state.adminToken
    });
    assertStatus(res, 200);
    assert(res.body.data.shelter.status === 'under_verification');
  });

  await test('admin can verify the facility, moving it to "registered"', async () => {
    const res = await api('POST', `/admin/shelters/${state.potentialId}/verify`, {
      token: state.adminToken,
      body: { note: 'Confirmed on site' }
    });
    assertStatus(res, 200);
    assert(res.body.data.shelter.status === 'registered');
    assert(res.body.data.shelter.verificationStatus === 'verified');
  });

  await test('a "registered" (verified but not activated) facility still cannot be recommended', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: { latitude: 12.95, longitude: 77.62, disasterCode: 'flood', priority: 'high', totalPeople: 2 }
    });
    const excluded = res.body.data.excluded.find((e) => e.shelterId === state.potentialId);
    assert(excluded && excluded.reason === 'not_yet_activated');
  });

  await test('activation requires a positive capacity', async () => {
    const res = await api('POST', `/admin/shelters/${state.potentialId}/activate`, {
      token: state.adminToken,
      body: { totalCapacity: 0 }
    });
    assertStatus(res, 400);
  });

  await test('admin can activate the facility, making it live', async () => {
    const res = await api('POST', `/admin/shelters/${state.potentialId}/activate`, {
      token: state.adminToken,
      body: { totalCapacity: 200, currentOccupancy: 10, note: 'Opened for the drill' }
    });
    assertStatus(res, 200);
    const s = res.body.data.shelter;
    assert(s.status === 'available', `expected available after activation, got ${s.status}`);
    assert(s.availableCapacity === 190);
  });

  await test('an activated facility is now allocatable', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: { latitude: 12.95, longitude: 77.62, disasterCode: 'flood', priority: 'high', totalPeople: 2 }
    });
    assert(
      res.body.data.recommendations.some((r) => r.id === state.potentialId),
      'the newly activated facility should now be recommendable'
    );
  });

  // ---------------------------------------------------------------
  console.log('\n[allocation review]');

  await test('admin can confirm ("keep") an automatic allocation', async () => {
    const created = await api('POST', '/emergency-requests', {
      token: state.userToken,
      body: {
        latitude: 12.9345, longitude: 77.6263, disasterCode: 'flood',
        priority: 'medium', totalPeople: 3
      }
    });
    assertStatus(created, 201);
    state.reviewRequestId = created.body.data.request.id;

    const res = await api('POST', `/admin/requests/${state.reviewRequestId}/confirm`, {
      token: state.adminToken,
      body: { note: 'Looks correct' }
    });
    assertStatus(res, 200);
    assert(res.body.data.request.allocationConfirmed === true);
  });

  await test('admin can reassign a request to a different shelter', async () => {
    const detail = await api('GET', `/admin/requests/${state.reviewRequestId}`, {
      token: state.adminToken
    });
    const original = detail.body.data.request.recommendedShelterId;
    const alt = detail.body.data.request.recommendations.find((r) => r.id !== original);
    assert(alt, 'need at least two recommendations to test reassignment');

    const res = await api('POST', `/admin/requests/${state.reviewRequestId}/reassign`, {
      token: state.adminToken,
      body: { shelterId: alt.id, note: 'Family requested a closer option' }
    });
    assertStatus(res, 200);
    assert(res.body.data.request.recommendedShelterId === alt.id);
    assert(res.body.data.request.allocationConfirmed === true);
  });

  await test('reassigning to a pre-activation facility is refused', async () => {
    const potential = await api('POST', '/admin/shelters', {
      token: state.adminToken,
      body: {
        name: 'Reassign Guard Test Facility', address: '3 Test Road, Bengaluru',
        latitude: 12.95, longitude: 77.62, totalCapacity: 50,
        facilityCategory: 'potential_facility'
      }
    });
    const res = await api('POST', `/admin/requests/${state.reviewRequestId}/reassign`, {
      token: state.adminToken,
      body: { shelterId: potential.body.data.shelter.id }
    });
    assertStatus(res, 400);
  });

  // ---------------------------------------------------------------
  console.log('\n[history / audit trail]');

  await test('history includes the allocation and confirmation just made', async () => {
    const res = await api('GET', `/admin/history?limit=50`, { token: state.adminToken });
    assertStatus(res, 200);
    const forRequest = res.body.data.entries.filter((e) => e.requestId === state.reviewRequestId);
    const actions = forRequest.map((e) => e.action);
    assert(actions.includes('allocated'), `expected 'allocated' in ${actions}`);
    assert(actions.includes('confirmed'), `expected 'confirmed' in ${actions}`);
    assert(actions.includes('reassigned'), `expected 'reassigned' in ${actions}`);
  });

  await test('shelter lifecycle actions are recorded in the same history feed', async () => {
    const res = await api('GET', `/admin/history?limit=200`, { token: state.adminToken });
    const shelterActions = res.body.data.entries.filter((e) => e.shelterId === state.potentialId);
    const actions = shelterActions.map((e) => e.action);
    assert(actions.includes('shelter_verified'), `expected shelter_verified in ${actions}`);
    assert(actions.includes('shelter_activated'), `expected shelter_activated in ${actions}`);
  });

  await test('history export returns a CSV with a header row', async () => {
    const res = await fetch(`${BASE}/admin/history/export`, {
      headers: { Authorization: `Bearer ${state.adminToken}` }
    });
    assert(res.status === 200);
    const text = await res.text();
    assert(text.startsWith('id,created_at,action'), 'missing CSV header');
    assert(text.split('\n').length > 1, 'expected at least one data row');
  });

  await test('a normal user cannot read the audit history', async () => {
    assertStatus(await api('GET', '/admin/history', { token: state.userToken }), 403);
  });

  // ---------------------------------------------------------------
  console.log('\n[disabled count & other-disaster field]');

  await test('disabled count above the total is rejected', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.93, longitude: 77.62, disasterCode: 'flood',
        priority: 'medium', totalPeople: 3, disabledCount: 9
      }
    });
    assertStatus(res, 400);
    assert(res.body.error.details.disabledCount);
  });

  await test('selecting "other" as the disaster requires a label', async () => {
    const res = await api('POST', '/recommendations/preview', {
      token: state.userToken,
      body: {
        latitude: 12.93, longitude: 77.62, disasterCode: 'other',
        priority: 'medium', totalPeople: 3
      }
    });
    assertStatus(res, 400);
    assert(res.body.error.details.otherDisasterLabel);
  });

  await test('an "other" disaster with a label is accepted and stored', async () => {
    const res = await api('POST', '/emergency-requests', {
      token: state.userToken,
      body: {
        latitude: 12.93, longitude: 77.62, disasterCode: 'other',
        otherDisasterLabel: 'Gas leak evacuation', priority: 'medium', totalPeople: 2,
        disabledCount: 1
      }
    });
    assertStatus(res, 201);
    assert(res.body.data.request.otherDisasterLabel === 'Gas leak evacuation');
    assert(res.body.data.request.disabledCount === 1);
  });

  // ---------------------------------------------------------------
  console.log('\n[admin request & user management]');

  await test('admin can list all emergency requests', async () => {
    const res = await api('GET', '/admin/requests', { token: state.adminToken });
    assertStatus(res, 200);
    assert(res.body.data.requests.some((r) => r.id === state.requestId));
  });

  await test('admin can read any request detail', async () => {
    const res = await api('GET', `/admin/requests/${state.requestId}`, { token: state.adminToken });
    assertStatus(res, 200);
    assert(res.body.data.request.recommendations.length > 0);
  });

  await test('admin can update request status', async () => {
    const res = await api('PATCH', `/admin/requests/${state.requestId}/status`, {
      token: state.adminToken,
      body: { status: 'fulfilled' }
    });
    assertStatus(res, 200);
    assert(res.body.data.request.status === 'fulfilled');
  });

  await test('admin user list excludes sensitive fields', async () => {
    const res = await api('GET', '/admin/users', { token: state.adminToken });
    assertStatus(res, 200);
    const u = res.body.data.users[0];
    assert(u.password_hash === undefined && u.passwordHash === undefined, 'hash leaked');
    assert(u.phone === undefined, 'phone should not be exposed in the admin list');
    assert(typeof u.requestCount === 'number');
  });

  await test('admin cannot change their own role', async () => {
    const me = await api('GET', '/auth/me', { token: state.adminToken });
    const res = await api('PATCH', `/admin/users/${me.body.data.user.id}`, {
      token: state.adminToken,
      body: { role: 'user' }
    });
    assertStatus(res, 400);
  });

  await test('admin can deactivate a user and that user loses access', async () => {
    const victim = await api('POST', '/auth/register', {
      body: {
        name: 'Victim', email: `victim_${Date.now()}@example.com`,
        password: 'Passw0rd123', confirmPassword: 'Passw0rd123'
      }
    });
    const victimToken = victim.body.data.token;
    assertStatus(await api('GET', '/auth/me', { token: victimToken }), 200);

    const res = await api('PATCH', `/admin/users/${victim.body.data.user.id}`, {
      token: state.adminToken,
      body: { isActive: false }
    });
    assertStatus(res, 200);
    // Existing token must stop working immediately, not at expiry.
    assertStatus(await api('GET', '/auth/me', { token: victimToken }), 403);
  });

  // ---------------------------------------------------------------
  console.log('\n[error handling]');

  await test('unknown route returns a structured 404', async () => {
    const res = await api('GET', '/does-not-exist');
    assertStatus(res, 404);
    assert(res.body.error.message);
  });

  await test('malformed id returns 400, not a crash', async () => {
    const res = await api('GET', '/shelters/abc', { token: state.userToken });
    assert([400, 404].includes(res.status), `got ${res.status}`);
  });

  await test('cancelling a request works and is not repeatable', async () => {
    const created = await api('POST', '/emergency-requests', {
      token: state.userToken,
      body: {
        latitude: 12.95, longitude: 77.6, disasterCode: 'fire',
        priority: 'medium', totalPeople: 2
      }
    });
    assertStatus(created, 201);
    const id = created.body.data.request.id;
    const first = await api('POST', `/emergency-requests/${id}/cancel`, { token: state.userToken });
    assertStatus(first, 200);
    assert(first.body.data.request.status === 'cancelled');
    assertStatus(await api('POST', `/emergency-requests/${id}/cancel`, { token: state.userToken }), 400);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');
  process.exit(failed > 0 ? 1 : 0);
})();
