'use strict';

const db = require('../config/database');
const ApiError = require('../utils/ApiError');
const shelterService = require('./shelter.service');
const history = require('./history.service');
const { allocateShelters } = require('./allocation.engine');

const MAX_RECOMMENDATIONS = 8;

/** Facility codes flagged critical in the DB, cached for the process lifetime. */
let criticalFacilityCache = null;
async function getCriticalFacilities() {
  if (criticalFacilityCache) return criticalFacilityCache;
  const { rows } = await db.query('SELECT code FROM facilities WHERE is_critical = TRUE');
  criticalFacilityCache = rows.map((r) => r.code);
  return criticalFacilityCache;
}

/**
 * Runs the allocation engine against live shelter data.
 * Does not write anything — used both by the preview endpoint and by
 * createRequestWithRecommendations.
 */
async function computeRecommendations(request) {
  const [candidates, criticalFacilities] = await Promise.all([
    shelterService.getAllocationCandidates(request.disasterCode),
    getCriticalFacilities()
  ]);

  if (candidates.length === 0) {
    return {
      recommendations: [],
      excluded: [],
      meta: { evaluated: 0, viable: 0, excluded: 0, returned: 0 },
      message: 'No shelters are registered in the system yet.'
    };
  }

  const result = allocateShelters(request, candidates, {
    limit: MAX_RECOMMENDATIONS,
    criticalFacilities
  });

  if (result.recommendations.length === 0) {
    result.message =
      'No shelter currently satisfies this request. Every nearby shelter is full, closed, ' +
      'not yet activated, out of range, or too small for the group. Contact emergency ' +
      'services directly.';
  }

  return result;
}

/**
 * Persists the request together with the ranked result set, inside one
 * transaction so history can never show a request without its rankings.
 */
async function createRequestWithRecommendations(userId, input) {
  const result = await computeRecommendations(input);
  const top = result.recommendations[0] || null;

  const requestId = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO emergency_requests
        (user_id, latitude, longitude, location_source, location_label, disaster_code, priority,
         total_people, children_count, senior_count, women_count, disabled_count,
         other_disaster_label, required_facilities, notes, status, recommended_shelter_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        userId, input.latitude, input.longitude, input.locationSource || 'current', input.locationLabel || null,
        input.disasterCode, input.priority, input.totalPeople,
        input.childrenCount, input.seniorCount, input.womenCount, input.disabledCount ?? 0,
        input.disasterCode === 'other' ? input.otherDisasterLabel || null : null,
        input.requiredFacilities, input.notes || null,
        top ? 'allocated' : 'pending',
        top ? top.id : null
      ]
    );
    const id = rows[0].id;

    for (const rec of result.recommendations) {
      await client.query(
        `INSERT INTO request_recommendations
          (request_id, shelter_id, rank, suitability_score, distance_km, score_breakdown)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id, rec.id, rec.rank, rec.suitabilityScore, rec.distanceKm,
          JSON.stringify({
            breakdown: rec.breakdown,
            matchedFacilities: rec.matchedFacilities,
            missingFacilities: rec.missingFacilities
          })
        ]
      );
    }
    return id;
  });

  if (top) {
    await history.logHistory({
      requestId,
      shelterId: top.id,
      action: 'allocated',
      performedBy: userId,
      notes: `Automatically allocated ${top.name} (score ${top.suitabilityScore})`
    });
  }

  const saved = await getRequestById(requestId, userId, 'user');
  return { ...saved, engineMeta: result.meta, excluded: result.excluded, message: result.message };
}

function mapRequestRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    latitude: row.latitude,
    longitude: row.longitude,
    locationSource: row.location_source || 'current',
    locationLabel: row.location_label,
    disasterCode: row.disaster_code,
    disasterLabel: row.disaster_label,
    otherDisasterLabel: row.other_disaster_label,
    priority: row.priority,
    totalPeople: row.total_people,
    childrenCount: row.children_count,
    seniorCount: row.senior_count,
    womenCount: row.women_count,
    disabledCount: row.disabled_count,
    requiredFacilities: row.required_facilities || [],
    notes: row.notes,
    status: row.status,
    recommendedShelterId: row.recommended_shelter_id,
    recommendedShelterName: row.recommended_shelter_name,
    allocationConfirmed: row.allocation_confirmed,
    allocationConfirmedAt: row.allocation_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const REQUEST_SELECT = `
  SELECT r.id, r.user_id, r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
         r.location_source, r.location_label, r.disaster_code, r.priority, r.total_people,
         r.children_count, r.senior_count, r.women_count, r.disabled_count,
         r.other_disaster_label, r.required_facilities,
         r.notes, r.status, r.recommended_shelter_id,
         r.allocation_confirmed, r.allocation_confirmed_at,
         r.created_at, r.updated_at,
         u.name AS user_name, u.email AS user_email,
         dt.label AS disaster_label,
         s.name AS recommended_shelter_name
  FROM emergency_requests r
  JOIN users u ON u.id = r.user_id
  JOIN disaster_types dt ON dt.code = r.disaster_code
  LEFT JOIN shelters s ON s.id = r.recommended_shelter_id
`;

async function listRequests({ userId = null, limit = 50, offset = 0, status, priority }) {
  const where = [];
  const params = [];
  if (userId) {
    params.push(userId);
    where.push(`r.user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    where.push(`r.priority = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countParams = [...params];
  params.push(limit, offset);

  const [{ rows }, count] = await Promise.all([
    db.query(
      `${REQUEST_SELECT} ${whereSql}
       ORDER BY
         CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                         WHEN 'medium' THEN 2 ELSE 3 END,
         r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM emergency_requests r ${whereSql}`, countParams)
  ]);

  return { requests: rows.map(mapRequestRow), total: count.rows[0].total };
}

/** Loads a request plus its stored ranking, enforcing ownership for non-admins. */
async function getRequestById(id, userId, role) {
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Emergency request not found');

  const request = mapRequestRow(rows[0]);
  if (role !== 'admin' && request.userId !== userId) {
    throw ApiError.forbidden('You can only view your own emergency requests');
  }

  const recs = await db.query(
    `SELECT rr.rank, rr.suitability_score::float8 AS suitability_score,
            rr.distance_km::float8 AS distance_km, rr.score_breakdown,
            s.id, s.name, s.address, s.city,
            s.latitude::float8 AS latitude, s.longitude::float8 AS longitude,
            s.total_capacity, s.current_occupancy, s.available_capacity, s.status,
            s.contact_phone, s.emergency_phone, s.is_wheelchair_accessible,
            COALESCE(f.facilities, '{}') AS facilities,
            COALESCE(sds.suitability_level::float8, 0) AS disaster_suitability
     FROM request_recommendations rr
     JOIN shelters s ON s.id = rr.shelter_id
     LEFT JOIN LATERAL (
       SELECT array_agg(sf.facility_code) AS facilities
       FROM shelter_facilities sf WHERE sf.shelter_id = s.id
     ) f ON TRUE
     LEFT JOIN shelter_disaster_support sds
       ON sds.shelter_id = s.id AND sds.disaster_code = $2
     WHERE rr.request_id = $1
     ORDER BY rr.rank ASC`,
    [id, request.disasterCode]
  );

  request.recommendations = recs.rows.map((r) => ({
    rank: r.rank,
    id: r.id,
    name: r.name,
    address: r.address,
    city: r.city,
    latitude: r.latitude,
    longitude: r.longitude,
    totalCapacity: r.total_capacity,
    currentOccupancy: r.current_occupancy,
    availableCapacity: r.available_capacity,
    status: r.status,
    contactPhone: r.contact_phone,
    emergencyPhone: r.emergency_phone,
    isWheelchairAccessible: r.is_wheelchair_accessible,
    facilities: r.facilities || [],
    disasterSuitability: r.disaster_suitability,
    suitabilityScore: r.suitability_score,
    distanceKm: r.distance_km,
    breakdown: r.score_breakdown?.breakdown || {},
    matchedFacilities: r.score_breakdown?.matchedFacilities || [],
    missingFacilities: r.score_breakdown?.missingFacilities || []
  }));

  return request;
}

async function updateRequestStatus(id, status, actorUserId = null) {
  const { rows } = await db.query(
    'UPDATE emergency_requests SET status = $1 WHERE id = $2 RETURNING recommended_shelter_id',
    [status, id]
  );
  if (!rows.length) throw ApiError.notFound('Emergency request not found');

  if (status === 'fulfilled' || status === 'cancelled') {
    await history.logHistory({
      requestId: id,
      shelterId: rows[0].recommended_shelter_id,
      action: 'closed',
      performedBy: actorUserId,
      notes: `Request marked ${status}`
    });
  }

  return getRequestById(id, null, 'admin');
}

async function cancelRequest(id, userId) {
  const { rowCount } = await db.query(
    `UPDATE emergency_requests SET status = 'cancelled'
     WHERE id = $1 AND user_id = $2 AND status IN ('pending','allocated')`,
    [id, userId]
  );
  if (!rowCount) {
    throw ApiError.badRequest('This request cannot be cancelled');
  }
  return getRequestById(id, userId, 'user');
}

/**
 * Admin review of an automatic allocation: "Keep allocation" — records
 * that a human has looked at the machine recommendation and endorsed it.
 * Does not change which shelter is assigned.
 */
async function confirmAllocation(id, actorUserId, note) {
  const { rows } = await db.query(
    `UPDATE emergency_requests
     SET allocation_confirmed = TRUE, allocation_confirmed_at = NOW()
     WHERE id = $1 AND recommended_shelter_id IS NOT NULL
     RETURNING recommended_shelter_id`,
    [id]
  );
  if (!rows.length) {
    throw ApiError.badRequest('This request has no allocation to confirm');
  }

  await history.logHistory({
    requestId: id,
    shelterId: rows[0].recommended_shelter_id,
    action: 'confirmed',
    performedBy: actorUserId,
    notes: note || 'Allocation reviewed and kept'
  });

  return getRequestById(id, null, 'admin');
}

/**
 * Admin review of an automatic allocation: "Change shelter" — overrides
 * the engine's top pick with a shelter the admin selects directly
 * (typically one of the request's own stored recommendations, but any
 * active shelter with enough space may be chosen). The override is
 * final: it is not overwritten if the request is re-scored later.
 */
async function reassignAllocation(id, actorUserId, shelterId, note) {
  const shelter = await shelterService.getShelterById(shelterId);
  if (!shelter.isActive || shelter.isPreActivation) {
    throw ApiError.badRequest('That facility is not currently eligible for allocation');
  }

  const { rows } = await db.query(
    `UPDATE emergency_requests
     SET recommended_shelter_id = $2,
         status = 'allocated',
         allocation_confirmed = TRUE,
         allocation_confirmed_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id, shelterId]
  );
  if (!rows.length) throw ApiError.notFound('Emergency request not found');

  await history.logHistory({
    requestId: id,
    shelterId,
    action: 'reassigned',
    performedBy: actorUserId,
    notes: note || `Reassigned to ${shelter.name}`
  });

  return getRequestById(id, null, 'admin');
}

module.exports = {
  computeRecommendations,
  createRequestWithRecommendations,
  listRequests,
  getRequestById,
  updateRequestStatus,
  cancelRequest,
  confirmAllocation,
  reassignAllocation,
  MAX_RECOMMENDATIONS
};
