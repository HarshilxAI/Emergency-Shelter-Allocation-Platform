-- =====================================================================
-- OPTIONAL: PostGIS upgrade path
-- =====================================================================
-- The platform runs entirely without PostGIS. Distance is computed with a
-- haversine SQL expression (see backend/src/services/recommendation.service.js)
-- and a bounding-box pre-filter on (latitude, longitude).
--
-- If PostGIS is available in your deployment, running this file adds a
-- generated geography column plus a GiST index. Nothing in the application
-- requires it, so apply it only if the extension is installed.
--
--   psql -d esap -f database/schema/002_postgis_optional.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE shelters
    ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
    GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_shelters_geom ON shelters USING GIST (geom);

ALTER TABLE emergency_requests
    ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
    GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_requests_geom ON emergency_requests USING GIST (geom);

-- With this column present a nearest-shelter query becomes:
--   SELECT id, ST_Distance(geom, ST_MakePoint(:lon, :lat)::geography) / 1000 AS km
--   FROM shelters WHERE is_active ORDER BY geom <-> ST_MakePoint(:lon, :lat)::geography;
