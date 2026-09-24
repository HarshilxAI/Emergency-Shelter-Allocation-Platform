'use strict';

const db = require('../config/database');
const ApiError = require('../utils/ApiError');
const history = require('./history.service');

/**
 * Shared SELECT that aggregates facilities and disaster ratings into arrays
 * so a shelter is retrieved in one round trip instead of N+1 queries.
 * Includes the full facility model added in the 50% milestone: category
 * (registered shelter vs. potential facility), lifecycle status, capacity
 * typing (official vs. estimated, with method), and provenance/verification
 * tracking.
 */
const SHELTER_SELECT = `
  SELECT
    s.id, s.name, s.description, s.address, s.city, s.state, s.pincode,
    s.latitude::float8  AS latitude,
    s.longitude::float8 AS longitude,
    s.total_capacity, s.current_occupancy, s.available_capacity, s.status,
    s.contact_name, s.contact_phone, s.emergency_phone,
    s.is_wheelchair_accessible, s.accessibility_notes, s.is_active,
    s.facility_category, s.facility_type, s.city_id,
    s.capacity_type, s.capacity_method, s.floor_area_sqm::float8 AS floor_area_sqm,
    s.data_source, s.source_reference,
    s.verification_status, s.verified_by, s.verified_at, s.last_verified_at,
    s.activated_at,
    s.created_at, s.updated_at,
    c.name AS city_name, c.state AS city_state,
    vu.name AS verified_by_name,
    COALESCE(f.facilities, '{}')       AS facilities,
    COALESCE(d.disaster_support, '[]'::json) AS disaster_support
  FROM shelters s
  LEFT JOIN cities c ON c.id = s.city_id
  LEFT JOIN users vu ON vu.id = s.verified_by
  LEFT JOIN LATERAL (
    SELECT array_agg(sf.facility_code ORDER BY sf.facility_code) AS facilities
    FROM shelter_facilities sf WHERE sf.shelter_id = s.id
  ) f ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'disasterCode', sds.disaster_code,
             'suitabilityLevel', sds.suitability_level::float8
           ) ORDER BY sds.disaster_code) AS disaster_support
    FROM shelter_disaster_support sds WHERE sds.shelter_id = s.id
  ) d ON TRUE
`;

/** Lifecycle statuses that are pre-activation — never shown to ordinary users. */
const PRE_ACTIVATION_STATUSES = ['potential', 'under_verification', 'registered'];

function mapShelter(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    latitude: row.latitude,
    longitude: row.longitude,
    totalCapacity: row.total_capacity,
    currentOccupancy: row.current_occupancy,
    availableCapacity: row.available_capacity,
    occupancyRate:
      row.total_capacity > 0
        ? Math.round((row.current_occupancy / row.total_capacity) * 100)
        : 0,
    status: row.status,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    emergencyPhone: row.emergency_phone,
    isWheelchairAccessible: row.is_wheelchair_accessible,
    accessibilityNotes: row.accessibility_notes,
    isActive: row.is_active,
    facilities: row.facilities || [],
    disasterSupport: row.disaster_support || [],

    // Facility model
    facilityCategory: row.facility_category,
    facilityType: row.facility_type,
    cityId: row.city_id,
    cityName: row.city_name,
    cityState: row.city_state,
    isPotential: row.facility_category === 'potential_facility',
    isPreActivation: PRE_ACTIVATION_STATUSES.includes(row.status),

    // Capacity typing
    capacityType: row.capacity_type,
    capacityMethod: row.capacity_method,
    floorAreaSqm: row.floor_area_sqm,

    // Provenance & verification
    dataSource: row.data_source,
    sourceReference: row.source_reference,
    verificationStatus: row.verification_status,
    verifiedByName: row.verified_by_name,
    verifiedAt: row.verified_at,
    lastVerifiedAt: row.last_verified_at,
    activatedAt: row.activated_at,

    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listShelters(filters = {}) {
  const where = [];
  const params = [];

  if (!filters.includeInactive) {
    where.push('s.is_active = TRUE');
    // Ordinary users browse live shelters only — a candidate facility
    // still under review is not something to be recommended or shown
    // alongside real shelters.
    where.push(`s.status NOT IN ('potential', 'under_verification', 'registered')`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`s.status = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    where.push(`s.facility_category = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(s.name ILIKE $${params.length} OR s.address ILIKE $${params.length})`);
  }
  if (filters.disasterCode) {
    params.push(filters.disasterCode);
    where.push(
      `EXISTS (SELECT 1 FROM shelter_disaster_support x
               WHERE x.shelter_id = s.id AND x.disaster_code = $${params.length})`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filters.limit ?? 100, filters.offset ?? 0);

  const sql = `${SHELTER_SELECT} ${whereSql}
    ORDER BY s.name ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const [{ rows }, countResult] = await Promise.all([
    db.query(sql, params),
    db.query(
      `SELECT COUNT(*)::int AS total FROM shelters s ${whereSql}`,
      params.slice(0, params.length - 2)
    )
  ]);

  return { shelters: rows.map(mapShelter), total: countResult.rows[0].total };
}

async function getShelterById(id, { includeInactive = true } = {}) {
  const { rows } = await db.query(`${SHELTER_SELECT} WHERE s.id = $1`, [id]);
  const shelter = mapShelter(rows[0]);
  if (!shelter || (!includeInactive && !shelter.isActive)) {
    throw ApiError.notFound('Shelter not found');
  }
  return shelter;
}

/**
 * Candidate shelters for the allocation engine. Returns every active
 * facility regardless of lifecycle status — the engine's own hard filter
 * is what excludes potential/under-verification/registered facilities,
 * so those exclusions come back with a proper reason rather than being
 * silently absent from the candidate pool.
 */
async function getAllocationCandidates(disasterCode) {
  const { rows } = await db.query(
    `SELECT
       s.id, s.name, s.address, s.city,
       s.latitude::float8 AS latitude, s.longitude::float8 AS longitude,
       s.total_capacity, s.current_occupancy, s.available_capacity,
       s.status, s.is_active, s.is_wheelchair_accessible,
       s.contact_phone, s.emergency_phone,
       COALESCE(f.facilities, '{}') AS facilities,
       COALESCE(sds.suitability_level::float8, $2::float8) AS disaster_suitability,
       (sds.disaster_code IS NOT NULL) AS disaster_rated
     FROM shelters s
     LEFT JOIN LATERAL (
       SELECT array_agg(sf.facility_code) AS facilities
       FROM shelter_facilities sf WHERE sf.shelter_id = s.id
     ) f ON TRUE
     LEFT JOIN shelter_disaster_support sds
       ON sds.shelter_id = s.id AND sds.disaster_code = $1
     WHERE s.is_active = TRUE`,
    [disasterCode, require('./allocation.engine').UNRATED_DISASTER_SUITABILITY]
  );

  return rows.map((r) => ({
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
    isActive: r.is_active,
    isWheelchairAccessible: r.is_wheelchair_accessible,
    contactPhone: r.contact_phone,
    emergencyPhone: r.emergency_phone,
    facilities: r.facilities || [],
    disasterSuitability: r.disaster_suitability,
    disasterRated: r.disaster_rated
  }));
}

async function createShelter(data) {
  // A potential facility (a school, community hall, etc. awaiting review)
  // starts life in the 'potential' status unless the caller explicitly set
  // one. A registered shelter defaults to 'available' as before.
  const defaultStatus =
    data.facilityCategory === 'potential_facility' ? 'potential' : 'available';

  const id = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO shelters
        (name, description, address, city, state, pincode, latitude, longitude,
         total_capacity, current_occupancy, status, contact_name, contact_phone,
         emergency_phone, is_wheelchair_accessible, accessibility_notes, is_active,
         facility_category, facility_type, city_id,
         capacity_type, capacity_method, floor_area_sqm,
         data_source, source_reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               COALESCE($11::shelter_status, $26::shelter_status),
               $12,$13,$14,$15,$16,$17,
               COALESCE($18::facility_category,'registered_shelter'::facility_category),
               COALESCE($19::facility_type,'registered_shelter'::facility_type),
               $20,
               COALESCE($21::capacity_type,'official'::capacity_type),
               $22,$23,
               COALESCE($24,'DEMO_DATASET'),$25)
       RETURNING id`,
      [
        data.name, data.description || null, data.address, data.city, data.state,
        data.pincode || null, data.latitude, data.longitude, data.totalCapacity,
        data.currentOccupancy ?? 0, data.status || null, data.contactName || null,
        data.contactPhone || null, data.emergencyPhone || null,
        data.isWheelchairAccessible ?? false, data.accessibilityNotes || null,
        data.isActive ?? true,
        data.facilityCategory || null, data.facilityType || null, data.cityId || null,
        data.capacityType || null, data.capacityMethod || null, data.floorAreaSqm || null,
        data.dataSource || null, data.sourceReference || null,
        defaultStatus
      ]
    );
    const newId = rows[0].id;
    await replaceFacilities(client, newId, data.facilities || []);
    await replaceDisasterSupport(client, newId, data.disasterSupport || []);
    return newId;
  });

  return getShelterById(id);
}

async function updateShelter(id, data, actorUserId = null) {
  const existing = await getShelterById(id);

  await db.withTransaction(async (client) => {
    const fieldMap = {
      name: 'name', description: 'description', address: 'address', city: 'city',
      state: 'state', pincode: 'pincode', latitude: 'latitude', longitude: 'longitude',
      totalCapacity: 'total_capacity', currentOccupancy: 'current_occupancy',
      status: 'status', contactName: 'contact_name', contactPhone: 'contact_phone',
      emergencyPhone: 'emergency_phone', isWheelchairAccessible: 'is_wheelchair_accessible',
      accessibilityNotes: 'accessibility_notes', isActive: 'is_active',
      facilityCategory: 'facility_category', facilityType: 'facility_type', cityId: 'city_id',
      capacityType: 'capacity_type', capacityMethod: 'capacity_method',
      floorAreaSqm: 'floor_area_sqm', dataSource: 'data_source', sourceReference: 'source_reference'
    };

    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        params.push(data[key] === '' ? null : data[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }

    // Guard the capacity invariant across partial updates.
    const nextCapacity = data.totalCapacity ?? existing.totalCapacity;
    const nextOccupancy = data.currentOccupancy ?? existing.currentOccupancy;
    if (nextOccupancy > nextCapacity) {
      throw ApiError.badRequest('Occupancy cannot exceed total capacity', {
        currentOccupancy: `Maximum is ${nextCapacity}`
      });
    }

    if (sets.length) {
      params.push(id);
      await client.query(
        `UPDATE shelters SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    if (data.facilities !== undefined) await replaceFacilities(client, id, data.facilities);
    if (data.disasterSupport !== undefined) {
      await replaceDisasterSupport(client, id, data.disasterSupport);
    }
  });

  await history.logHistory({
    shelterId: id,
    action: 'shelter_updated',
    performedBy: actorUserId,
    notes: `${existing.name} details updated`
  });

  return getShelterById(id);
}

async function replaceFacilities(client, shelterId, codes) {
  await client.query('DELETE FROM shelter_facilities WHERE shelter_id = $1', [shelterId]);
  if (!codes.length) return;
  await client.query(
    `INSERT INTO shelter_facilities (shelter_id, facility_code)
     SELECT $1, UNNEST($2::varchar[]) ON CONFLICT DO NOTHING`,
    [shelterId, codes]
  );
}

async function replaceDisasterSupport(client, shelterId, entries) {
  await client.query('DELETE FROM shelter_disaster_support WHERE shelter_id = $1', [shelterId]);
  if (!entries.length) return;
  await client.query(
    `INSERT INTO shelter_disaster_support (shelter_id, disaster_code, suitability_level)
     SELECT $1, d.code, d.level
     FROM UNNEST($2::varchar[], $3::numeric[]) AS d(code, level)
     ON CONFLICT DO NOTHING`,
    [shelterId, entries.map((e) => e.disasterCode), entries.map((e) => e.suitabilityLevel)]
  );
}

/** Soft delete by default; hard delete only when nothing references the shelter. */
async function deactivateShelter(id, actorUserId = null) {
  const { rows } = await db.query(
    `UPDATE shelters SET is_active = FALSE WHERE id = $1 RETURNING name`,
    [id]
  );
  if (!rows.length) throw ApiError.notFound('Shelter not found');

  await history.logHistory({
    shelterId: id,
    action: 'shelter_deactivated',
    performedBy: actorUserId,
    notes: `${rows[0].name} deactivated`
  });

  return getShelterById(id);
}

async function deleteShelter(id) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS refs FROM emergency_requests WHERE recommended_shelter_id = $1`,
    [id]
  );
  if (rows[0].refs > 0) {
    throw ApiError.conflict(
      'This shelter is referenced by existing emergency requests. Deactivate it instead of deleting.'
    );
  }
  const { rowCount } = await db.query('DELETE FROM shelters WHERE id = $1', [id]);
  if (!rowCount) throw ApiError.notFound('Shelter not found');
  return { id, deleted: true };
}

async function updateOccupancy(id, currentOccupancy) {
  const shelter = await getShelterById(id);
  if (currentOccupancy > shelter.totalCapacity) {
    throw ApiError.badRequest('Occupancy cannot exceed total capacity', {
      currentOccupancy: `Maximum is ${shelter.totalCapacity}`
    });
  }
  await db.query('UPDATE shelters SET current_occupancy = $1 WHERE id = $2', [
    currentOccupancy,
    id
  ]);
  return getShelterById(id);
}

// ---------------------------------------------------------------------
// Facility lifecycle: potential -> under_verification -> registered -> activated
// ---------------------------------------------------------------------

/** Moves a potential facility into active review by an administrator. */
async function markUnderVerification(id, actorUserId, note) {
  const shelter = await getShelterById(id);
  if (!shelter.isPotential) {
    throw ApiError.badRequest('Only a potential facility can be put under verification');
  }
  if (shelter.status !== 'potential') {
    throw ApiError.badRequest(`Cannot move from "${shelter.status}" to under verification`);
  }
  await db.query(`UPDATE shelters SET status = 'under_verification' WHERE id = $1`, [id]);
  await history.logHistory({
    shelterId: id,
    action: 'shelter_verified',
    performedBy: actorUserId,
    notes: note || `${shelter.name} moved under verification`
  });
  return getShelterById(id);
}

/**
 * Records that an administrator has confirmed a potential facility's
 * details are accurate. Moves it to 'registered' — verified, but not yet
 * accepting allocations until it is explicitly activated.
 */
async function verifyFacility(id, actorUserId, note) {
  const shelter = await getShelterById(id);
  if (!shelter.isPotential) {
    throw ApiError.badRequest('Only a potential facility can be verified');
  }
  if (!['potential', 'under_verification'].includes(shelter.status)) {
    throw ApiError.badRequest(`Cannot verify a facility in status "${shelter.status}"`);
  }

  await db.query(
    `UPDATE shelters SET
       status = 'registered',
       verification_status = 'verified',
       verified_by = $2,
       verified_at = NOW(),
       last_verified_at = NOW()
     WHERE id = $1`,
    [id, actorUserId]
  );

  await history.logHistory({
    shelterId: id,
    action: 'shelter_verified',
    performedBy: actorUserId,
    notes: note || `${shelter.name} verified and marked registered`
  });

  return getShelterById(id);
}

/**
 * Activates a verified facility, making it eligible for allocation for the
 * first time. Capacity may be supplied here if it was not already set —
 * an admin typically fills this in with either an official figure or an
 * estimate produced by the capacity estimator.
 */
async function activateFacility(id, actorUserId, { totalCapacity, currentOccupancy, note } = {}) {
  const shelter = await getShelterById(id);
  if (shelter.status !== 'registered') {
    throw ApiError.badRequest(
      `A facility must be verified (status "registered") before it can be activated. Current status: "${shelter.status}".`
    );
  }

  const finalCapacity = totalCapacity ?? shelter.totalCapacity;
  const finalOccupancy = currentOccupancy ?? shelter.currentOccupancy;
  if (!finalCapacity || finalCapacity < 1) {
    throw ApiError.badRequest('A total capacity is required before activation', {
      totalCapacity: 'Enter a capacity greater than zero'
    });
  }
  if (finalOccupancy > finalCapacity) {
    throw ApiError.badRequest('Occupancy cannot exceed total capacity', {
      currentOccupancy: `Maximum is ${finalCapacity}`
    });
  }

  // Seed status as 'available'; the sync_shelter_status trigger immediately
  // recomputes it against the real occupancy ratio on this same write.
  await db.query(
    `UPDATE shelters SET
       status = 'available',
       total_capacity = $2,
       current_occupancy = $3,
       activated_at = NOW()
     WHERE id = $1`,
    [id, finalCapacity, finalOccupancy]
  );

  await history.logHistory({
    shelterId: id,
    action: 'shelter_activated',
    performedBy: actorUserId,
    notes: note || `${shelter.name} activated for allocation`
  });

  return getShelterById(id);
}

async function getReferenceData() {
  const [disasters, facilities, cities] = await Promise.all([
    db.query('SELECT code, label, description FROM disaster_types ORDER BY label'),
    db.query('SELECT code, label, description, is_critical FROM facilities ORDER BY is_critical DESC, label'),
    db.query('SELECT id, name, state, country FROM cities WHERE is_active = TRUE ORDER BY name')
  ]);
  return {
    disasterTypes: disasters.rows,
    facilities: facilities.rows.map((f) => ({
      code: f.code,
      label: f.label,
      description: f.description,
      isCritical: f.is_critical
    })),
    cities: cities.rows
  };
}

module.exports = {
  listShelters,
  getShelterById,
  getAllocationCandidates,
  createShelter,
  updateShelter,
  deactivateShelter,
  deleteShelter,
  updateOccupancy,
  markUnderVerification,
  verifyFacility,
  activateFacility,
  getReferenceData,
  mapShelter,
  PRE_ACTIVATION_STATUSES
};
