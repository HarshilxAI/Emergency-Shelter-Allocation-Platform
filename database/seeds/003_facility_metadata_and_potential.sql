-- =====================================================================
-- Seed patch — facility metadata backfill + potential facility demo set
-- =====================================================================
-- Idempotent: safe to re-run against an already-seeded database. The
-- backfill UPDATE simply re-asserts the same values; the potential
-- facility inserts are guarded with WHERE NOT EXISTS on the name.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Backfill provenance/verification metadata on the 14 demo shelters
--    seeded by 002_demo_shelters.sql. They were entered directly by the
--    project team as verified, official-capacity, registered shelters.
-- ---------------------------------------------------------------------
UPDATE shelters SET
    city_id = (SELECT id FROM cities WHERE name = 'Bengaluru' LIMIT 1),
    facility_category = 'registered_shelter',
    facility_type = 'registered_shelter',
    capacity_type = 'official',
    data_source = 'DEMO_DATASET',
    verification_status = 'verified',
    verified_at = COALESCE(verified_at, created_at),
    last_verified_at = COALESCE(last_verified_at, created_at),
    activated_at = COALESCE(activated_at, created_at)
WHERE facility_category = 'registered_shelter'
  AND status NOT IN ('potential', 'under_verification', 'registered')
  AND city_id IS NULL;

-- ---------------------------------------------------------------------
-- 2. Potential / conventional emergency facilities.
-- =====================================================================
-- DEMONSTRATION DATA. These are fictional records representing the KIND
-- of public building ESAP is designed to bring into the shelter network
-- (a government school, a community hall, and so on). They are explicitly
-- NOT designated emergency shelters — that is the entire point of the
-- potential-facility category. Each is seeded partway through the review
-- lifecycle so the admin verification/activation flow has real records to
-- work through:
--   - two are 'potential'        (freshly discovered, awaiting review)
--   - one  is 'under_verification' (an admin has started reviewing it)
--   - one  is 'registered'       (verified, capacity set, not yet activated)
-- Capacity for all four is ESTIMATED using the AREA_BASED method — the
-- Sphere Handbook minimum of 3.5 m² per person applied to a plausible
-- usable floor area — and is clearly labelled as an estimate, never as
-- an official figure. source_reference is a fictional placeholder in
-- the same spirit as the rest of the demo dataset, not a real dataset.
-- =====================================================================

INSERT INTO shelters
  (name, description, address, city, state, pincode, latitude, longitude,
   total_capacity, current_occupancy, status,
   facility_category, facility_type, city_id,
   capacity_type, capacity_method, floor_area_sqm,
   data_source, source_reference, verification_status,
   is_wheelchair_accessible, accessibility_notes, is_active)
SELECT * FROM (VALUES
  (
    'Bengaluru South Government Higher Primary School',
    'Demo record. A two-storey government school building with a large assembly hall and open playground, identified as a candidate emergency facility for the south zone. Not yet reviewed by an administrator.',
    'Bannerghatta Road, Arekere', 'Bengaluru', 'Karnataka', '560076',
    12.891200::numeric, 77.598400::numeric,
    227, 0, 'potential'::shelter_status,
    'potential_facility'::facility_category, 'government_school'::facility_type,
    (SELECT id FROM cities WHERE name = 'Bengaluru' LIMIT 1),
    'estimated'::capacity_type, 'AREA_BASED', 795.00,
    'OSM_DEMO', 'Demo reference only — OpenStreetMap building footprint (fictional entry, ways/994210xxx)',
    'unverified'::verification_status,
    FALSE, 'Not yet assessed.', TRUE
  ),
  (
    'Whitefield Community Hall',
    'Demo record. A privately-run community event hall with a single large hall space, flagged as a possible overflow facility for the east zone. Awaiting initial review.',
    'Hope Farm Junction, Whitefield', 'Bengaluru', 'Karnataka', '560066',
    12.969500::numeric, 77.750600::numeric,
    128, 0, 'potential'::shelter_status,
    'potential_facility'::facility_category, 'community_hall'::facility_type,
    (SELECT id FROM cities WHERE name = 'Bengaluru' LIMIT 1),
    'estimated'::capacity_type, 'AREA_BASED', 450.00,
    'BBMP_OPEN_DATA_DEMO', 'Demo reference only — fictional municipal facility listing (Ward 84, record #2291)',
    'unverified'::verification_status,
    FALSE, 'Not yet assessed.', TRUE
  ),
  (
    'Jayanagar Sports Complex Indoor Hall',
    'Demo record. An indoor multi-purpose sports hall adjoining the existing Jayanagar Civic Assembly Hall shelter. An administrator has started reviewing this facility for possible activation.',
    '4th T Block, Jayanagar', 'Bengaluru', 'Karnataka', '560041',
    12.921700::numeric, 77.582100::numeric,
    342, 0, 'under_verification'::shelter_status,
    'potential_facility'::facility_category, 'sports_complex'::facility_type,
    (SELECT id FROM cities WHERE name = 'Bengaluru' LIMIT 1),
    'estimated'::capacity_type, 'AREA_BASED', 1197.00,
    'OSM_DEMO', 'Demo reference only — OpenStreetMap building footprint (fictional entry, ways/994233xxx)',
    'unverified'::verification_status,
    TRUE, 'Ramped entrance at the main gate; under review.', TRUE
  ),
  (
    'Vijayanagar Public Auditorium',
    'Demo record. A municipal auditorium with a raised stage and fixed seating that can be cleared for mass shelter use. Verified by an administrator; capacity and facilities are confirmed, and the facility is ready for activation.',
    'Vijayanagar 2nd Stage', 'Bengaluru', 'Karnataka', '560040',
    12.968300::numeric, 77.531800::numeric,
    260, 0, 'registered'::shelter_status,
    'potential_facility'::facility_category, 'public_auditorium'::facility_type,
    (SELECT id FROM cities WHERE name = 'Bengaluru' LIMIT 1),
    'estimated'::capacity_type, 'AREA_BASED', 910.00,
    'BBMP_OPEN_DATA_DEMO', 'Demo reference only — fictional municipal facility listing (Ward 129, record #1187)',
    'verified'::verification_status,
    TRUE, 'Step-free access confirmed during verification visit.', TRUE
  )
) AS v(
    name, description, address, city, state, pincode, latitude, longitude,
    total_capacity, current_occupancy, status,
    facility_category, facility_type, city_id,
    capacity_type, capacity_method, floor_area_sqm,
    data_source, source_reference, verification_status,
    is_wheelchair_accessible, accessibility_notes, is_active
)
WHERE NOT EXISTS (SELECT 1 FROM shelters s WHERE s.name = v.name);

-- Stamp the 'registered' demo facility with a verification timestamp/admin
-- so its detail view has a complete audit trail to show.
UPDATE shelters SET
    verified_at = NOW() - INTERVAL '2 days',
    last_verified_at = NOW() - INTERVAL '2 days',
    verified_by = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
WHERE name = 'Vijayanagar Public Auditorium'
  AND verified_at IS NULL;

-- Give the two 'potential' and one 'under_verification' facilities a
-- baseline disaster-suitability rating so they behave sensibly once
-- activated (fire/flood suitable; not asserted for earthquake).
INSERT INTO shelter_disaster_support (shelter_id, disaster_code, suitability_level)
SELECT s.id, d.code, d.level
FROM shelters s
JOIN (VALUES
  ('Bengaluru South Government Higher Primary School', 'flood', 0.75),
  ('Bengaluru South Government Higher Primary School', 'fire',  0.65),
  ('Whitefield Community Hall',                        'flood', 0.65),
  ('Whitefield Community Hall',                        'fire',  0.70),
  ('Jayanagar Sports Complex Indoor Hall',              'flood', 0.80),
  ('Jayanagar Sports Complex Indoor Hall',              'fire',  0.75),
  ('Vijayanagar Public Auditorium',                     'flood', 0.80),
  ('Vijayanagar Public Auditorium',                     'fire',  0.85),
  ('Vijayanagar Public Auditorium',                     'cyclone', 0.70)
) AS d(shelter_name, code, level) ON d.shelter_name = s.name
ON CONFLICT DO NOTHING;

INSERT INTO shelter_facilities (shelter_id, facility_code)
SELECT s.id, f.code
FROM shelters s
JOIN (VALUES
  ('Bengaluru South Government Higher Primary School', ARRAY['water','toilets']),
  ('Whitefield Community Hall',                        ARRAY['water','electricity','toilets']),
  ('Jayanagar Sports Complex Indoor Hall',              ARRAY['water','electricity','toilets','accessibility']),
  ('Vijayanagar Public Auditorium',                     ARRAY['water','electricity','toilets','accessibility','security'])
) AS m(shelter_name, codes) ON m.shelter_name = s.name
CROSS JOIN LATERAL unnest(m.codes) AS f(code)
ON CONFLICT DO NOTHING;
