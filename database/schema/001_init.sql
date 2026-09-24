-- =====================================================================
-- Emergency Shelter Allocation Platform — Relational schema (PostgreSQL)
-- =====================================================================
-- Location columns are stored as NUMERIC lat/lon pairs. This keeps the
-- schema portable (no PostGIS required to run the project) while remaining
-- PostGIS-ready: see 002_postgis_optional.sql for the upgrade path.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS request_recommendations CASCADE;
DROP TABLE IF EXISTS emergency_requests CASCADE;
DROP TABLE IF EXISTS shelter_facilities CASCADE;
DROP TABLE IF EXISTS shelter_disaster_support CASCADE;
DROP TABLE IF EXISTS shelters CASCADE;
DROP TABLE IF EXISTS facilities CASCADE;
DROP TABLE IF EXISTS disaster_types CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS shelter_status CASCADE;
DROP TYPE IF EXISTS request_priority CASCADE;
DROP TYPE IF EXISTS request_status CASCADE;

CREATE TYPE user_role        AS ENUM ('user', 'admin');
CREATE TYPE shelter_status   AS ENUM ('available', 'limited', 'full', 'closed');
CREATE TYPE request_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE request_status   AS ENUM ('pending', 'allocated', 'fulfilled', 'cancelled');

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120)  NOT NULL CHECK (length(btrim(name)) >= 2),
    email           VARCHAR(255)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255),              -- NULL only for OAuth-only accounts
    google_id       VARCHAR(255) UNIQUE,
    phone           VARCHAR(20),
    role            user_role     NOT NULL DEFAULT 'user',
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_has_credential CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

CREATE INDEX idx_users_email ON users (lower(email));
CREATE INDEX idx_users_role  ON users (role);

-- ---------------------------------------------------------------------
-- reference data: disaster types & facilities
-- ---------------------------------------------------------------------
CREATE TABLE disaster_types (
    code        VARCHAR(30) PRIMARY KEY,
    label       VARCHAR(80) NOT NULL,
    description TEXT
);

CREATE TABLE facilities (
    code        VARCHAR(30) PRIMARY KEY,
    label       VARCHAR(80) NOT NULL,
    description TEXT,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE  -- critical facilities weigh more in scoring
);

-- ---------------------------------------------------------------------
-- shelters
-- ---------------------------------------------------------------------
CREATE TABLE shelters (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(160)   NOT NULL,
    description         TEXT,
    address             TEXT           NOT NULL,
    city                VARCHAR(80)    NOT NULL DEFAULT 'Bengaluru',
    state               VARCHAR(80)    NOT NULL DEFAULT 'Karnataka',
    pincode             VARCHAR(10),
    latitude            NUMERIC(9,6)   NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude           NUMERIC(9,6)   NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    total_capacity      INTEGER        NOT NULL CHECK (total_capacity > 0),
    current_occupancy   INTEGER        NOT NULL DEFAULT 0 CHECK (current_occupancy >= 0),
    -- available_capacity is derived, never stored twice by hand
    available_capacity  INTEGER GENERATED ALWAYS AS (GREATEST(total_capacity - current_occupancy, 0)) STORED,
    status              shelter_status NOT NULL DEFAULT 'available',
    contact_name        VARCHAR(120),
    contact_phone       VARCHAR(20),
    emergency_phone     VARCHAR(20),
    is_wheelchair_accessible BOOLEAN NOT NULL DEFAULT FALSE,
    accessibility_notes TEXT,
    is_active           BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT shelters_occupancy_within_capacity CHECK (current_occupancy <= total_capacity)
);

CREATE INDEX idx_shelters_status   ON shelters (status) WHERE is_active;
CREATE INDEX idx_shelters_location ON shelters (latitude, longitude);
CREATE INDEX idx_shelters_active   ON shelters (is_active);

-- shelter <-> facility (many-to-many)
CREATE TABLE shelter_facilities (
    shelter_id    INTEGER     NOT NULL REFERENCES shelters(id)   ON DELETE CASCADE,
    facility_code VARCHAR(30) NOT NULL REFERENCES facilities(code) ON DELETE CASCADE,
    PRIMARY KEY (shelter_id, facility_code)
);
CREATE INDEX idx_shelter_facilities_facility ON shelter_facilities (facility_code);

-- shelter <-> disaster suitability, with a 0..1 suitability weight
CREATE TABLE shelter_disaster_support (
    shelter_id        INTEGER      NOT NULL REFERENCES shelters(id)            ON DELETE CASCADE,
    disaster_code     VARCHAR(30)  NOT NULL REFERENCES disaster_types(code)    ON DELETE CASCADE,
    suitability_level NUMERIC(3,2) NOT NULL DEFAULT 1.00
                      CHECK (suitability_level BETWEEN 0 AND 1),
    PRIMARY KEY (shelter_id, disaster_code)
);
CREATE INDEX idx_sds_disaster ON shelter_disaster_support (disaster_code);

-- ---------------------------------------------------------------------
-- emergency_requests
-- ---------------------------------------------------------------------
CREATE TABLE emergency_requests (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude             NUMERIC(9,6)     NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude            NUMERIC(9,6)     NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    location_label       TEXT,
    disaster_code        VARCHAR(30)      NOT NULL REFERENCES disaster_types(code),
    priority             request_priority NOT NULL DEFAULT 'medium',
    total_people         INTEGER          NOT NULL CHECK (total_people BETWEEN 1 AND 500),
    children_count       INTEGER          NOT NULL DEFAULT 0 CHECK (children_count  >= 0),
    senior_count         INTEGER          NOT NULL DEFAULT 0 CHECK (senior_count    >= 0),
    women_count          INTEGER          NOT NULL DEFAULT 0 CHECK (women_count     >= 0),
    -- Categories overlap (a woman may also be a senior), so each sub-count is
    -- bounded by the total but the sum is deliberately NOT constrained.
    required_facilities  VARCHAR(30)[]    NOT NULL DEFAULT '{}',
    notes                TEXT,
    status               request_status   NOT NULL DEFAULT 'pending',
    recommended_shelter_id INTEGER        REFERENCES shelters(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT req_children_le_total CHECK (children_count <= total_people),
    CONSTRAINT req_seniors_le_total  CHECK (senior_count   <= total_people),
    CONSTRAINT req_women_le_total    CHECK (women_count    <= total_people)
);

CREATE INDEX idx_requests_user     ON emergency_requests (user_id, created_at DESC);
CREATE INDEX idx_requests_status   ON emergency_requests (status);
CREATE INDEX idx_requests_priority ON emergency_requests (priority);
CREATE INDEX idx_requests_created  ON emergency_requests (created_at DESC);

-- ---------------------------------------------------------------------
-- request_recommendations — the ranked result set stored per request,
-- so history pages show exactly what the engine produced at that time.
-- ---------------------------------------------------------------------
CREATE TABLE request_recommendations (
    id                 SERIAL PRIMARY KEY,
    request_id         INTEGER      NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE,
    shelter_id         INTEGER      NOT NULL REFERENCES shelters(id)           ON DELETE CASCADE,
    rank               INTEGER      NOT NULL CHECK (rank > 0),
    suitability_score  NUMERIC(5,2) NOT NULL CHECK (suitability_score BETWEEN 0 AND 100),
    distance_km        NUMERIC(8,3) NOT NULL CHECK (distance_km >= 0),
    score_breakdown    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, shelter_id),
    UNIQUE (request_id, rank)
);
CREATE INDEX idx_recs_request ON request_recommendations (request_id, rank);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shelters_updated BEFORE UPDATE ON shelters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_requests_updated BEFORE UPDATE ON emergency_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Keep shelter.status consistent with occupancy.
-- 'closed' is an operator decision and is never overwritten automatically.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_shelter_status() RETURNS TRIGGER AS $$
DECLARE
    free_ratio NUMERIC;
BEGIN
    IF NEW.status = 'closed' THEN
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

CREATE TRIGGER trg_shelters_status BEFORE INSERT OR UPDATE OF total_capacity, current_occupancy, status
    ON shelters FOR EACH ROW EXECUTE FUNCTION sync_shelter_status();

COMMIT;
