-- =====================================================================
-- Migration 003 — Facility model upgrade (50% milestone)
-- =====================================================================
-- Adds, without breaking anything created by 001_init.sql:
--   - a scalable Country -> State -> City -> Facility location hierarchy
--   - the registered-shelter / potential-facility distinction
--   - an expanded shelter lifecycle status
--   - capacity typing (official vs. estimated) with a documented method
--   - data source and verification tracking
--   - disabled-people count and a free-text "other disaster" label on
--     emergency requests
--   - an allocation_history table backing the admin History/Allocations
--     screens and the audit trail
-- Safe to run once against a database created by 001_init.sql (and
-- optionally 002_postgis_optional.sql). Re-running is guarded with
-- IF NOT EXISTS / DO blocks so it will not fail on a partially-applied
-- database, but it is not designed to be run twice on a fully-applied one.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Location hierarchy: cities (Country -> State -> City -> Facility)
-- ---------------------------------------------------------------------
-- Bengaluru is the Review-2 demonstration city, but nothing here is
-- hard-coded to it: adding a second city is a single INSERT, and a
-- shelter's city_id is supplementary metadata, not something the
-- allocation engine depends on (distance math uses lat/lon directly and
-- is city-agnostic).
CREATE TABLE IF NOT EXISTS cities (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    state       VARCHAR(100) NOT NULL,
    country     VARCHAR(100) NOT NULL DEFAULT 'India',
    latitude    NUMERIC(9,6),
    longitude   NUMERIC(9,6),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, state, country)
);

INSERT INTO cities (name, state, country, latitude, longitude)
VALUES ('Bengaluru', 'Karnataka', 'India', 12.971600, 77.594600)
ON CONFLICT (name, state, country) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. New enums for the facility lifecycle
-- ---------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE facility_category AS ENUM ('registered_shelter', 'potential_facility');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    -- A public building's structural type. Only meaningful for
    -- potential_facility records; a registered_shelter is typically
    -- purpose-run, but the field is available to both.
    CREATE TYPE facility_type AS ENUM (
        'registered_shelter', 'government_school', 'community_hall',
        'sports_complex', 'public_auditorium', 'government_building', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE capacity_type AS ENUM ('official', 'estimated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM ('unverified', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE allocation_action AS ENUM (
        'allocated', 'confirmed', 'reassigned', 'closed',
        'shelter_verified', 'shelter_activated', 'shelter_updated', 'shelter_deactivated'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 3. Expand shelter_status with the lifecycle values.
-- ---------------------------------------------------------------------
-- Existing rows already use 'available' | 'limited' | 'full' | 'closed'
-- from 001_init.sql; those values are kept so nothing already stored
-- becomes invalid. 'closed' remains the operator-set "temporarily
-- closed" state used by sync_shelter_status(). New values cover the
-- potential-facility path: a candidate building starts 'potential',
-- moves to 'under_verification' while an admin reviews it, becomes
-- 'registered' once verified with capacity and facilities recorded,
-- and is then activated — at which point sync_shelter_status() takes
-- over and drives it between available/limited/full like any shelter.
-- 'inactive' is the deactivated end state for any facility.
DO $$ BEGIN
    ALTER TYPE shelter_status ADD VALUE IF NOT EXISTS 'potential';
    ALTER TYPE shelter_status ADD VALUE IF NOT EXISTS 'under_verification';
    ALTER TYPE shelter_status ADD VALUE IF NOT EXISTS 'registered';
    ALTER TYPE shelter_status ADD VALUE IF NOT EXISTS 'inactive';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 4. Extend shelters with category, type, capacity typing, source and
--    verification tracking.
-- ---------------------------------------------------------------------
ALTER TABLE shelters
    ADD COLUMN IF NOT EXISTS city_id              INTEGER REFERENCES cities(id),
    ADD COLUMN IF NOT EXISTS facility_category     facility_category NOT NULL DEFAULT 'registered_shelter',
    ADD COLUMN IF NOT EXISTS facility_type         facility_type NOT NULL DEFAULT 'registered_shelter',
    ADD COLUMN IF NOT EXISTS capacity_type         capacity_type NOT NULL DEFAULT 'official',
    -- Free-text method label, e.g. 'AREA_BASED'. NULL when capacity_type
    -- is 'official' — there is nothing to explain.
    ADD COLUMN IF NOT EXISTS capacity_method       VARCHAR(40),
    -- The floor area an AREA_BASED estimate was computed from, kept so
    -- the estimate is reproducible and auditable rather than a bare
    -- number with no working shown.
    ADD COLUMN IF NOT EXISTS floor_area_sqm        NUMERIC(10,2) CHECK (floor_area_sqm IS NULL OR floor_area_sqm > 0),
    ADD COLUMN IF NOT EXISTS data_source            VARCHAR(60) NOT NULL DEFAULT 'DEMO_DATASET',
    ADD COLUMN IF NOT EXISTS source_reference       TEXT,
    ADD COLUMN IF NOT EXISTS verification_status    verification_status NOT NULL DEFAULT 'unverified',
    ADD COLUMN IF NOT EXISTS verified_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_verified_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activated_at           TIMESTAMPTZ;

-- A capacity_type of 'estimated' without a method is a data-quality gap
-- worth catching at write time.
ALTER TABLE shelters DROP CONSTRAINT IF EXISTS shelters_estimated_needs_method;
ALTER TABLE shelters ADD CONSTRAINT shelters_estimated_needs_method
    CHECK (capacity_type <> 'estimated' OR capacity_method IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_shelters_category ON shelters (facility_category);
CREATE INDEX IF NOT EXISTS idx_shelters_city ON shelters (city_id);

-- Backfill: every shelter already in the database was entered as a
-- fully registered, admin-verified demonstration record.
UPDATE shelters SET
    city_id = (SELECT id FROM cities WHERE name = 'Bengaluru' LIMIT 1),
    verification_status = 'verified',
    verified_at = COALESCE(verified_at, created_at),
    last_verified_at = COALESCE(last_verified_at, created_at),
    activated_at = COALESCE(activated_at, created_at)
WHERE city_id IS NULL;

-- ---------------------------------------------------------------------
-- 5. Re-scope the status-sync trigger to the operational lifecycle only.
-- ---------------------------------------------------------------------
-- A potential facility, one under verification, or one that has been
-- deactivated must never be silently flipped to "available" just
-- because its occupancy columns changed. Only a facility that is
-- ALREADY live (available/limited/full) is auto-derived among those
-- three. 'registered' is deliberately excluded here — a verified
-- facility must stay non-allocatable until an administrator explicitly
-- activates it (activateFacility() seeds status='available' at that
-- moment, and this trigger then takes over correctly from there).
-- 'closed' (temporarily closed) and every pre-activation or deactivated
-- state are left exactly as the admin set them.
CREATE OR REPLACE FUNCTION sync_shelter_status() RETURNS TRIGGER AS $$
DECLARE
    free_ratio NUMERIC;
BEGIN
    IF NEW.status NOT IN ('available', 'limited', 'full') THEN
        RETURN NEW;
    END IF;

    free_ratio := (NEW.total_capacity - NEW.current_occupancy)::NUMERIC
                  / NULLIF(NEW.total_capacity, 0);

    IF free_ratio <= 0 THEN
        NEW.status := 'full';
    ELSIF free_ratio < 0.20 THEN
        NEW.status := 'limited';
    ELSE
        NEW.status := 'available';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 6. Emergency requests: disabled-people count and a free-text label
--    for disaster_code = 'other'.
-- ---------------------------------------------------------------------
ALTER TABLE emergency_requests
    ADD COLUMN IF NOT EXISTS disabled_count      INTEGER NOT NULL DEFAULT 0 CHECK (disabled_count >= 0),
    ADD COLUMN IF NOT EXISTS other_disaster_label VARCHAR(120),
    ADD COLUMN IF NOT EXISTS allocation_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allocation_confirmed_at TIMESTAMPTZ;

ALTER TABLE emergency_requests DROP CONSTRAINT IF EXISTS req_disabled_le_total;
ALTER TABLE emergency_requests ADD CONSTRAINT req_disabled_le_total
    CHECK (disabled_count <= total_people);

-- ---------------------------------------------------------------------
-- 7. Allocation / audit history — backs the admin History and
--    Allocations screens with real records instead of static rows.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS allocation_history (
    id            SERIAL PRIMARY KEY,
    request_id    INTEGER REFERENCES emergency_requests(id) ON DELETE CASCADE,
    shelter_id    INTEGER REFERENCES shelters(id) ON DELETE SET NULL,
    action        allocation_action NOT NULL,
    performed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_request ON allocation_history (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_created ON allocation_history (created_at DESC);

COMMIT;
