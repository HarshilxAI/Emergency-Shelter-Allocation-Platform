#!/usr/bin/env node
'use strict';

/**
 * Allocation engine verification suite.
 * Pure-function tests — no database or server required.
 *
 *   npm run test:engine
 */

const {
  allocateShelters,
  haversineKm,
  scoreCapacity,
  scoreFacilities
} = require('../src/services/allocation.engine');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'mismatch'} — expected ${expected}, got ${actual}`);
  }
}

// ------------------------------------------------------------------
// Fixtures — a compact synthetic city centred on (12.95, 77.60)
// ------------------------------------------------------------------
const ORIGIN = { latitude: 12.95, longitude: 77.6 };

function shelter(overrides) {
  return {
    id: 1,
    name: 'Test Shelter',
    latitude: 12.95,
    longitude: 77.6,
    totalCapacity: 200,
    currentOccupancy: 50,
    availableCapacity: 150,
    status: 'available',
    isActive: true,
    isWheelchairAccessible: true,
    facilities: ['food', 'water', 'toilets'],
    disasterSuitability: 0.9,
    ...overrides
  };
}

function request(overrides) {
  return {
    ...ORIGIN,
    disasterCode: 'flood',
    priority: 'medium',
    totalPeople: 10,
    childrenCount: 0,
    seniorCount: 0,
    womenCount: 0,
    disabledCount: 0,
    requiredFacilities: [],
    ...overrides
  };
}

console.log('\nALLOCATION ENGINE TEST SUITE');
console.log('='.repeat(60));

// ------------------------------------------------------------------
console.log('\n[geometry]');

test('haversine returns 0 for identical points', () => {
  assertEqual(haversineKm(12.95, 77.6, 12.95, 77.6), 0);
});

test('haversine matches a known distance (approx. 1.11 km per 0.01 deg lat)', () => {
  const d = haversineKm(12.95, 77.6, 12.96, 77.6);
  assert(d > 1.09 && d < 1.13, `expected ~1.11 km, got ${d.toFixed(4)}`);
});

test('haversine is symmetric', () => {
  const a = haversineKm(12.95, 77.6, 13.03, 77.59);
  const b = haversineKm(13.03, 77.59, 12.95, 77.6);
  assert(Math.abs(a - b) < 1e-9, 'distance should be symmetric');
});

// ------------------------------------------------------------------
console.log('\n[hard filters — impossible shelters are removed, never ranked]');

test('full shelter is excluded', () => {
  const { recommendations, excluded } = allocateShelters(request(), [
    shelter({ id: 1, status: 'full', currentOccupancy: 200, availableCapacity: 0 })
  ]);
  assertEqual(recommendations.length, 0, 'should recommend nothing');
  assertEqual(excluded[0].reason, 'full');
});

test('closed shelter is excluded even with free space', () => {
  const { recommendations, excluded } = allocateShelters(request(), [
    shelter({ id: 1, status: 'closed', currentOccupancy: 0, availableCapacity: 200 })
  ]);
  assertEqual(recommendations.length, 0);
  assertEqual(excluded[0].reason, 'closed');
});

test('shelter smaller than the group is excluded', () => {
  const { recommendations, excluded } = allocateShelters(request({ totalPeople: 40 }), [
    shelter({ id: 1, totalCapacity: 60, currentOccupancy: 40, availableCapacity: 20 })
  ]);
  assertEqual(recommendations.length, 0);
  assertEqual(excluded[0].reason, 'insufficient_capacity');
});

test('shelter with exactly enough space is accepted', () => {
  const { recommendations } = allocateShelters(request({ totalPeople: 20 }), [
    shelter({ id: 1, totalCapacity: 60, currentOccupancy: 40, availableCapacity: 20 })
  ]);
  assertEqual(recommendations.length, 1, 'exact fit must be allowed');
});

test('shelter unrated for the disaster type is excluded below threshold', () => {
  const { recommendations, excluded } = allocateShelters(request({ disasterCode: 'earthquake' }), [
    shelter({ id: 1, disasterSuitability: 0.2 })
  ]);
  assertEqual(recommendations.length, 0);
  assertEqual(excluded[0].reason, 'unsuitable_for_disaster');
});

test('inactive shelter is excluded', () => {
  const { excluded } = allocateShelters(request(), [shelter({ id: 1, isActive: false })]);
  assertEqual(excluded[0].reason, 'inactive');
});

test('a potential facility (not yet activated) is excluded, never ranked', () => {
  const { recommendations, excluded } = allocateShelters(request(), [
    shelter({ id: 1, status: 'potential' })
  ]);
  assertEqual(recommendations.length, 0);
  assertEqual(excluded[0].reason, 'not_yet_activated');
});

test('a facility under verification is excluded', () => {
  const { excluded } = allocateShelters(request(), [
    shelter({ id: 1, status: 'under_verification' })
  ]);
  assertEqual(excluded[0].reason, 'not_yet_activated');
});

test('a verified-but-not-activated ("registered") facility is excluded', () => {
  const { excluded } = allocateShelters(request(), [shelter({ id: 1, status: 'registered' })]);
  assertEqual(excluded[0].reason, 'not_yet_activated');
});

test('a shelter with lifecycle status "inactive" is excluded', () => {
  const { excluded } = allocateShelters(request(), [shelter({ id: 1, status: 'inactive' })]);
  assertEqual(excluded[0].reason, 'inactive');
});

test('shelter beyond the priority range is excluded', () => {
  // ~111 km north — outside every profile's maxDistanceKm
  const { recommendations, excluded } = allocateShelters(request({ priority: 'critical' }), [
    shelter({ id: 1, latitude: 13.95, longitude: 77.6 })
  ]);
  assertEqual(recommendations.length, 0);
  assertEqual(excluded[0].reason, 'out_of_range');
});

test('critical request needing medical rejects a shelter without medical', () => {
  const { recommendations, excluded } = allocateShelters(
    request({ priority: 'critical', requiredFacilities: ['medical'] }),
    [shelter({ id: 1, facilities: ['food', 'water'] })]
  );
  assertEqual(recommendations.length, 0);
  assertEqual(excluded[0].reason, 'missing_critical_medical');
});

test('critical request needing medical accepts a shelter with medical', () => {
  const { recommendations } = allocateShelters(
    request({ priority: 'critical', requiredFacilities: ['medical'] }),
    [shelter({ id: 1, facilities: ['medical', 'food'] })]
  );
  assertEqual(recommendations.length, 1);
});

// ------------------------------------------------------------------
console.log('\n[ranking behaviour]');

test('nearby available shelter outranks an identical distant one', () => {
  const near = shelter({ id: 1, name: 'Near', latitude: 12.955, longitude: 77.6 });
  const far = shelter({ id: 2, name: 'Far', latitude: 13.05, longitude: 77.6 });
  const { recommendations } = allocateShelters(request(), [far, near]);
  assertEqual(recommendations[0].name, 'Near');
  assertEqual(recommendations[0].rank, 1);
  assertEqual(recommendations[1].rank, 2);
});

test('farther but far better-equipped shelter can outrank a bare nearby one', () => {
  // Near shelter has none of the four requested facilities; the far one has all.
  const near = shelter({
    id: 1,
    name: 'Near-Bare',
    latitude: 12.953,
    longitude: 77.6,
    facilities: [],
    disasterSuitability: 0.4,
    totalCapacity: 60,
    currentOccupancy: 45,
    availableCapacity: 15
  });
  const far = shelter({
    id: 2,
    name: 'Far-Equipped',
    latitude: 12.982,
    longitude: 77.6,
    facilities: ['medical', 'food', 'water', 'toilets', 'security'],
    disasterSuitability: 0.95,
    totalCapacity: 600,
    currentOccupancy: 100,
    availableCapacity: 500
  });
  const { recommendations } = allocateShelters(
    request({ priority: 'low', requiredFacilities: ['medical', 'food', 'water', 'toilets'] }),
    [near, far]
  );
  assertEqual(
    recommendations[0].name,
    'Far-Equipped',
    'suitability must be able to beat raw proximity'
  );
});

test('critical priority shifts the ranking towards the closer shelter', () => {
  const near = shelter({
    id: 1, name: 'Near-Basic', latitude: 12.957, longitude: 77.6,
    facilities: ['food', 'water'], disasterSuitability: 0.7
  });
  const far = shelter({
    id: 2, name: 'Far-Better', latitude: 13.01, longitude: 77.6,
    facilities: ['medical', 'food', 'water', 'toilets', 'security'], disasterSuitability: 0.95
  });
  const req = { requiredFacilities: ['food', 'water', 'toilets'] };

  const low = allocateShelters(request({ ...req, priority: 'low' }), [near, far]);
  const critical = allocateShelters(request({ ...req, priority: 'critical' }), [near, far]);

  // Absolute scores are not comparable across priorities (the distance decay
  // constant itself changes), so the meaningful check is the *gap*: raising
  // priority must widen the nearby shelter's advantage over the distant one.
  const gap = (res) =>
    res.recommendations.find((r) => r.id === 1).suitabilityScore -
    res.recommendations.find((r) => r.id === 2).suitabilityScore;

  assert(
    gap(critical) > gap(low),
    `critical priority must favour proximity more than low priority ` +
      `(critical gap ${gap(critical).toFixed(1)}, low gap ${gap(low).toFixed(1)})`
  );
});

test('missing requested facilities lower the score', () => {
  const withAll = shelter({ id: 1, facilities: ['medical', 'food', 'water', 'toilets'] });
  const withNone = shelter({ id: 2, facilities: ['electricity'] });
  const { recommendations } = allocateShelters(
    request({ requiredFacilities: ['medical', 'food', 'water', 'toilets'] }),
    [withAll, withNone]
  );
  assertEqual(recommendations[0].id, 1);
  assert(
    recommendations[0].suitabilityScore > recommendations[1].suitabilityScore,
    'full facility match must score higher'
  );
  assertEqual(recommendations[1].missingFacilities.length, 4);
});

test('disaster compatibility separates two otherwise identical shelters', () => {
  const good = shelter({ id: 1, disasterSuitability: 0.95 });
  const weak = shelter({ id: 2, disasterSuitability: 0.4 });
  const { recommendations } = allocateShelters(request({ disasterCode: 'earthquake' }), [
    weak,
    good
  ]);
  assertEqual(recommendations[0].id, 1);
});

test('different disaster types can reorder the same shelter set', () => {
  const quakeSafe = { id: 1, name: 'QuakeSafe' };
  const floodSafe = { id: 2, name: 'FloodSafe' };
  const forQuake = allocateShelters(request({ disasterCode: 'earthquake' }), [
    shelter({ ...quakeSafe, disasterSuitability: 0.95 }),
    shelter({ ...floodSafe, disasterSuitability: 0.35 })
  ]);
  const forFlood = allocateShelters(request({ disasterCode: 'flood' }), [
    shelter({ ...quakeSafe, disasterSuitability: 0.35 }),
    shelter({ ...floodSafe, disasterSuitability: 0.95 })
  ]);
  assertEqual(forQuake.recommendations[0].name, 'QuakeSafe');
  assertEqual(forFlood.recommendations[0].name, 'FloodSafe');
});

test('limited status scores below available, all else equal', () => {
  const avail = shelter({ id: 1, status: 'available' });
  const limited = shelter({ id: 2, status: 'limited' });
  const { recommendations } = allocateShelters(request(), [limited, avail]);
  assertEqual(recommendations[0].id, 1);
});

test('vulnerable-group facilities add a readiness bonus', () => {
  const plain = shelter({ id: 1, facilities: ['food', 'water'] });
  const familyReady = shelter({
    id: 2,
    facilities: ['food', 'water', 'child_friendly', 'women_friendly']
  });
  const req = request({ totalPeople: 8, childrenCount: 3, womenCount: 4 });
  const { recommendations } = allocateShelters(req, [plain, familyReady]);
  assertEqual(recommendations[0].id, 2, 'family-ready shelter should rank first');
});

test('a group with disabled people benefits from accessibility, like seniors do', () => {
  const noAccess = shelter({
    id: 1,
    facilities: ['food', 'water'],
    isWheelchairAccessible: false
  });
  const accessible = shelter({
    id: 2,
    facilities: ['food', 'water', 'accessibility'],
    isWheelchairAccessible: true
  });
  const req = request({ totalPeople: 6, disabledCount: 2 });
  const { recommendations } = allocateShelters(req, [noAccess, accessible]);
  assertEqual(recommendations[0].id, 2, 'accessible shelter should rank first');
});

// ------------------------------------------------------------------
console.log('\n[scoring invariants]');

test('every score stays within 0–100', () => {
  const shelters = [
    shelter({ id: 1 }),
    shelter({ id: 2, latitude: 13.1, facilities: [] }),
    shelter({ id: 3, status: 'limited', availableCapacity: 11, totalCapacity: 200 })
  ];
  const { recommendations } = allocateShelters(
    request({ requiredFacilities: ['medical', 'food'] }),
    shelters
  );
  for (const r of recommendations) {
    assert(
      r.suitabilityScore >= 0 && r.suitabilityScore <= 100,
      `score out of range: ${r.suitabilityScore}`
    );
  }
});

test('breakdown is returned for every recommendation', () => {
  const { recommendations } = allocateShelters(request(), [shelter()]);
  const b = recommendations[0].breakdown;
  for (const key of ['distance', 'capacity', 'facilities', 'disaster', 'readiness']) {
    assert(b[key] && typeof b[key].score === 'number', `missing breakdown.${key}`);
  }
});

test('component weights sum to 100% after priority renormalisation', () => {
  const { recommendations } = allocateShelters(request({ priority: 'critical' }), [shelter()]);
  const total = Object.values(recommendations[0].breakdown).reduce((a, c) => a + c.weight, 0);
  assert(Math.abs(total - 100) < 0.5, `weights sum to ${total}, expected 100`);
});

test('ranking is deterministic across repeated runs', () => {
  const shelters = [
    shelter({ id: 1, latitude: 12.96 }),
    shelter({ id: 2, latitude: 12.97 }),
    shelter({ id: 3, latitude: 12.98 })
  ];
  const a = allocateShelters(request(), shelters).recommendations.map((r) => r.id);
  const b = allocateShelters(request(), shelters).recommendations.map((r) => r.id);
  assertEqual(a.join(','), b.join(','));
});

test('capacity score is 0 when the group does not fit', () => {
  assertEqual(scoreCapacity(5, 100, 10), 0);
});

test('no requested facilities yields a neutral facility score', () => {
  assertEqual(scoreFacilities([], ['food'], new Set()).score, 1);
});

test('critical facilities are weighted double in the facility score', () => {
  const critical = new Set(['medical']);
  // Requested: medical (weight 2) + security (weight 1) = 3 possible.
  const onlyMedical = scoreFacilities(['medical', 'security'], ['medical'], critical).score;
  const onlySecurity = scoreFacilities(['medical', 'security'], ['security'], critical).score;
  assert(onlyMedical > onlySecurity, 'the critical facility must carry more weight');
  assert(Math.abs(onlyMedical - 2 / 3) < 1e-9, `expected 0.667, got ${onlyMedical}`);
});

// ------------------------------------------------------------------
console.log('\n[edge cases]');

test('empty shelter list returns an empty result rather than throwing', () => {
  const { recommendations, meta } = allocateShelters(request(), []);
  assertEqual(recommendations.length, 0);
  assertEqual(meta.evaluated, 0);
});

test('all shelters unusable returns zero recommendations with reasons', () => {
  const { recommendations, excluded } = allocateShelters(request(), [
    shelter({ id: 1, status: 'full', availableCapacity: 0 }),
    shelter({ id: 2, status: 'closed' }),
    shelter({ id: 3, isActive: false })
  ]);
  assertEqual(recommendations.length, 0);
  assertEqual(excluded.length, 3);
  assert(excluded.every((e) => e.reasonLabel), 'every exclusion needs a readable label');
});

test('result set is capped at the configured limit', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    shelter({ id: i + 1, latitude: 12.95 + i * 0.001 })
  );
  const { recommendations } = allocateShelters(request(), many, { limit: 8 });
  assertEqual(recommendations.length, 8);
});

test('meta counts reconcile: viable + excluded = evaluated', () => {
  const shelters = [
    shelter({ id: 1 }),
    shelter({ id: 2, status: 'closed' }),
    shelter({ id: 3, status: 'full', availableCapacity: 0 }),
    shelter({ id: 4 })
  ];
  const { meta } = allocateShelters(request(), shelters);
  assertEqual(meta.viable + meta.excluded, meta.evaluated);
  assertEqual(meta.evaluated, 4);
});

// ------------------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60) + '\n');
process.exit(failed > 0 ? 1 : 0);
