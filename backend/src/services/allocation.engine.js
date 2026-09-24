'use strict';

/**
 * =====================================================================
 * SHELTER ALLOCATION ENGINE
 * =====================================================================
 * Pure functions only — no database access, no I/O. That keeps the logic
 * unit-testable (see backend/scripts/test-engine.js) and makes the
 * ranking reproducible for a given input.
 *
 * The engine runs in two distinct phases:
 *
 *   PHASE 1 — HARD FILTERS (eliminate)
 *     A shelter that physically cannot take the group is removed from the
 *     result set entirely. It is never ranked, never shown as an option.
 *
 *   PHASE 2 — WEIGHTED SCORING (rank)
 *     Surviving shelters are scored 0–100 across five weighted components.
 *     Every component score is returned in the breakdown so the UI can
 *     explain *why* a shelter was ranked where it was.
 * =====================================================================
 */

// ---------------------------------------------------------------------
// Tunable constants — single source of truth for the algorithm
// ---------------------------------------------------------------------

/** Component weights. Must sum to 1. */
const WEIGHTS = {
  distance: 0.30,
  capacity: 0.20,
  facilities: 0.25,
  disaster: 0.20,
  readiness: 0.05
};

/**
 * Priority tuning. Higher-priority emergencies bias the ranking towards
 * getting people somewhere *fast* (distance matters more), while lower
 * priority allows optimising for a better-equipped shelter further away.
 * `reach` is the distance (km) at which the distance score hits ~0.5.
 */
const PRIORITY_PROFILE = {
  critical: { distanceBoost: 1.60, facilityBoost: 0.70, reachKm: 4,  maxDistanceKm: 25 },
  high:     { distanceBoost: 1.30, facilityBoost: 0.85, reachKm: 6,  maxDistanceKm: 35 },
  medium:   { distanceBoost: 1.00, facilityBoost: 1.00, reachKm: 9,  maxDistanceKm: 50 },
  low:      { distanceBoost: 0.80, facilityBoost: 1.15, reachKm: 12, maxDistanceKm: 60 }
};

/** Suitability assumed when a shelter has no rating for the disaster type. */
const UNRATED_DISASTER_SUITABILITY = 0.45;

/** A shelter rated below this for the disaster is hard-filtered out. */
const MIN_DISASTER_SUITABILITY = 0.30;

/** Critical facilities (medical/food/water/toilets) count double in matching. */
const CRITICAL_FACILITY_WEIGHT = 2;
const NORMAL_FACILITY_WEIGHT = 1;

/**
 * Critical-priority requests demand medical capability. If a critical
 * request explicitly asks for medical assistance, a shelter without it is
 * filtered out rather than merely penalised.
 */
const MEDICAL_FACILITY = 'medical';

/** Headroom kept free so a shelter is not filled to the last bed. */
const CAPACITY_BUFFER_RATIO = 0.0; // exact-fit allowed; buffer handled by scoring

/**
 * Readiness baselines by operational status. These sit below 1.0 on purpose
 * so that the vulnerable-group bonuses in scoreReadiness() have room to
 * raise the score instead of being clamped off.
 */
const READINESS_BASE = { available: 0.85, limited: 0.5 };

const EARTH_RADIUS_KM = 6371.0088;

// ---------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------

/** Great-circle distance in kilometres between two WGS84 points. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------------------------------------------------------------------
// Component scores — each returns a value in [0, 1]
// ---------------------------------------------------------------------

/**
 * Distance score: smooth decay, 1.0 at the door, ~0.5 at `reachKm`,
 * approaching 0 at the priority's maximum acceptable distance.
 */
function scoreDistance(distanceKm, profile) {
  if (distanceKm <= 0) return 1;
  const decay = 1 / (1 + distanceKm / profile.reachKm);
  const cutoffPenalty = Math.max(0, 1 - distanceKm / profile.maxDistanceKm);
  return clamp01(decay * (0.65 + 0.35 * cutoffPenalty));
}

/**
 * Capacity score: rewards genuine headroom after the group is admitted.
 * A shelter that would be left at 100% occupancy scores poorly even though
 * it technically fits, because it leaves no margin for the rest of the event.
 */
function scoreCapacity(availableCapacity, totalCapacity, peopleNeeded) {
  if (availableCapacity < peopleNeeded) return 0;
  const remainingAfter = availableCapacity - peopleNeeded;
  const headroomRatio = totalCapacity > 0 ? remainingAfter / totalCapacity : 0;
  // Saturates at 30% remaining headroom — beyond that, extra space adds little.
  const headroomScore = clamp01(headroomRatio / 0.30);
  // Small bonus for comfortably exceeding the group size.
  const fitRatio = clamp01(availableCapacity / Math.max(peopleNeeded * 2, 1));
  return clamp01(0.7 * headroomScore + 0.3 * fitRatio);
}

/**
 * Facility match: weighted coverage of what the group asked for.
 * Critical facilities count double. Requesting nothing yields a neutral 1.
 */
function scoreFacilities(requiredFacilities, shelterFacilities, criticalFacilitySet) {
  if (!requiredFacilities || requiredFacilities.length === 0) {
    return { score: 1, matched: [], missing: [] };
  }
  const have = new Set(shelterFacilities);
  let earned = 0;
  let possible = 0;
  const matched = [];
  const missing = [];

  for (const code of requiredFacilities) {
    const weight = criticalFacilitySet.has(code)
      ? CRITICAL_FACILITY_WEIGHT
      : NORMAL_FACILITY_WEIGHT;
    possible += weight;
    if (have.has(code)) {
      earned += weight;
      matched.push(code);
    } else {
      missing.push(code);
    }
  }
  return { score: possible === 0 ? 1 : clamp01(earned / possible), matched, missing };
}

/** Disaster compatibility, already normalised 0–1 in the database. */
function scoreDisaster(suitabilityLevel) {
  return clamp01(suitabilityLevel);
}

/**
 * Readiness: operational state of the shelter plus a light vulnerability
 * check — groups with children, seniors or women benefit from the matching
 * facilities even when they did not explicitly request them.
 */
function scoreReadiness(shelter, request) {
  // Bases deliberately leave headroom below 1.0 so the vulnerability
  // bonuses below can actually move the score. A base of 1.0 would make
  // every bonus invisible once clamped.
  const base =
    shelter.status === 'available' ? READINESS_BASE.available
      : shelter.status === 'limited' ? READINESS_BASE.limited
      : 0;
  if (base === 0) return 0;

  const have = new Set(shelter.facilities || []);
  let bonus = 0;

  if (request.childrenCount > 0 && have.has('child_friendly')) bonus += 0.05;
  if (request.womenCount > 0 && have.has('women_friendly')) bonus += 0.05;
  if (
    (request.seniorCount > 0 || request.disabledCount > 0) &&
    (have.has('accessibility') || shelter.isWheelchairAccessible)
  ) {
    bonus += 0.04;
  }
  if (request.childrenCount > 0 && have.has('medical')) bonus += 0.03;

  return clamp01(base + bonus);
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------------
// PHASE 1 — hard filters
// ---------------------------------------------------------------------

/**
 * Returns null when the shelter is viable, or a machine-readable reason
 * string when it must be excluded. Every exclusion reason is reported back
 * to the caller so the UI can explain "8 shelters were excluded, and why".
 */
function hardFilter(shelter, request, distanceKm, profile) {
  if (shelter.isActive === false) return 'inactive';
  if (shelter.status === 'inactive') return 'inactive';
  // A potential facility that has not yet been verified and activated by
  // an administrator is not an available shelter — it is a candidate
  // building under review. It must never be recommended.
  if (
    shelter.status === 'potential' ||
    shelter.status === 'under_verification' ||
    shelter.status === 'registered'
  ) {
    return 'not_yet_activated';
  }
  if (shelter.status === 'closed') return 'closed';
  if (shelter.status === 'full') return 'full';
  if (shelter.availableCapacity <= 0) return 'no_capacity';

  const needed = request.totalPeople;
  const usable = Math.floor(shelter.availableCapacity * (1 - CAPACITY_BUFFER_RATIO));
  if (usable < needed) return 'insufficient_capacity';

  if (shelter.disasterSuitability < MIN_DISASTER_SUITABILITY) return 'unsuitable_for_disaster';

  if (distanceKm > profile.maxDistanceKm) return 'out_of_range';

  // A critical emergency that explicitly requires medical support must not
  // be routed to a shelter with no medical capability.
  if (
    request.priority === 'critical' &&
    (request.requiredFacilities || []).includes(MEDICAL_FACILITY) &&
    !(shelter.facilities || []).includes(MEDICAL_FACILITY)
  ) {
    return 'missing_critical_medical';
  }

  return null;
}

const EXCLUSION_LABELS = {
  inactive: 'Shelter is deactivated',
  not_yet_activated: 'Facility has not been verified and activated yet',
  closed: 'Shelter is temporarily closed',
  full: 'Shelter is at full capacity',
  no_capacity: 'No spaces currently available',
  insufficient_capacity: 'Cannot accommodate the whole group',
  unsuitable_for_disaster: 'Not rated safe for this disaster type',
  out_of_range: 'Too far for this emergency priority',
  missing_critical_medical: 'No medical support for a critical request'
};

// ---------------------------------------------------------------------
// PHASE 2 — scoring
// ---------------------------------------------------------------------

function scoreShelter(shelter, request, distanceKm, profile, criticalFacilitySet) {
  const distanceScore = scoreDistance(distanceKm, profile);
  const capacityScore = scoreCapacity(
    shelter.availableCapacity,
    shelter.totalCapacity,
    request.totalPeople
  );
  const facility = scoreFacilities(
    request.requiredFacilities,
    shelter.facilities,
    criticalFacilitySet
  );
  const disasterScore = scoreDisaster(shelter.disasterSuitability);
  const readinessScore = scoreReadiness(shelter, request);

  // Priority re-weights distance against facility quality, then the whole
  // weight vector is renormalised so the total still sums to 1.
  const rawWeights = {
    distance: WEIGHTS.distance * profile.distanceBoost,
    capacity: WEIGHTS.capacity,
    facilities: WEIGHTS.facilities * profile.facilityBoost,
    disaster: WEIGHTS.disaster,
    readiness: WEIGHTS.readiness
  };
  const weightSum = Object.values(rawWeights).reduce((a, b) => a + b, 0);
  const w = Object.fromEntries(
    Object.entries(rawWeights).map(([k, v]) => [k, v / weightSum])
  );

  const total =
    distanceScore * w.distance +
    capacityScore * w.capacity +
    facility.score * w.facilities +
    disasterScore * w.disaster +
    readinessScore * w.readiness;

  const pct = (n) => Math.round(n * 1000) / 10; // one decimal place

  return {
    suitabilityScore: Math.round(total * 1000) / 10, // 0–100, one decimal
    breakdown: {
      distance: { score: pct(distanceScore), weight: pct(w.distance), value: `${distanceKm.toFixed(2)} km` },
      capacity: {
        score: pct(capacityScore),
        weight: pct(w.capacity),
        value: `${shelter.availableCapacity} of ${shelter.totalCapacity} free`
      },
      facilities: {
        score: pct(facility.score),
        weight: pct(w.facilities),
        value: `${facility.matched.length}/${(request.requiredFacilities || []).length} requested`
      },
      disaster: {
        score: pct(disasterScore),
        weight: pct(w.disaster),
        value: `${Math.round(shelter.disasterSuitability * 100)}% rated for ${request.disasterCode}`
      },
      readiness: { score: pct(readinessScore), weight: pct(w.readiness), value: shelter.status }
    },
    matchedFacilities: facility.matched,
    missingFacilities: facility.missing
  };
}

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

/**
 * @param {Object}  request  normalised emergency request
 * @param {Array}   shelters candidate shelters (already loaded from the DB)
 * @param {Object}  options  { limit, criticalFacilities }
 * @returns {{ recommendations: Array, excluded: Array, meta: Object }}
 */
function allocateShelters(request, shelters, options = {}) {
  const limit = options.limit || 10;
  const criticalFacilitySet = new Set(
    options.criticalFacilities || ['medical', 'food', 'water', 'toilets']
  );
  const profile = PRIORITY_PROFILE[request.priority] || PRIORITY_PROFILE.medium;

  const viable = [];
  const excluded = [];

  for (const shelter of shelters) {
    const distanceKm = haversineKm(
      request.latitude,
      request.longitude,
      shelter.latitude,
      shelter.longitude
    );

    const reason = hardFilter(shelter, request, distanceKm, profile);
    if (reason) {
      excluded.push({
        shelterId: shelter.id,
        name: shelter.name,
        distanceKm: Math.round(distanceKm * 1000) / 1000,
        reason,
        reasonLabel: EXCLUSION_LABELS[reason] || reason
      });
      continue;
    }

    const scored = scoreShelter(shelter, request, distanceKm, profile, criticalFacilitySet);
    viable.push({
      ...shelter,
      distanceKm: Math.round(distanceKm * 1000) / 1000,
      ...scored
    });
  }

  // Deterministic ordering: score desc, then distance asc, then id asc.
  viable.sort(
    (a, b) =>
      b.suitabilityScore - a.suitabilityScore ||
      a.distanceKm - b.distanceKm ||
      a.id - b.id
  );

  const recommendations = viable.slice(0, limit).map((s, i) => ({ ...s, rank: i + 1 }));

  return {
    recommendations,
    excluded,
    meta: {
      evaluated: shelters.length,
      viable: viable.length,
      excluded: excluded.length,
      returned: recommendations.length,
      priorityProfile: { priority: request.priority, ...profile },
      weights: WEIGHTS
    }
  };
}

module.exports = {
  allocateShelters,
  haversineKm,
  scoreDistance,
  scoreCapacity,
  scoreFacilities,
  scoreDisaster,
  scoreReadiness,
  hardFilter,
  WEIGHTS,
  PRIORITY_PROFILE,
  UNRATED_DISASTER_SUITABILITY,
  MIN_DISASTER_SUITABILITY,
  EXCLUSION_LABELS
};
