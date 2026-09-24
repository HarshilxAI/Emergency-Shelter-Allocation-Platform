-- =====================================================================
-- Migration 004 — Location source tracking
-- =====================================================================
-- Records whether an emergency request was submitted using the device's
-- current GPS coordinates or via manual location search/pin-drop.
-- This ensures request location is explicitly distinct from the user's
-- location, and that the allocation engine and routing use this request
-- location exclusively.
-- =====================================================================

BEGIN;

ALTER TABLE emergency_requests
    ADD COLUMN IF NOT EXISTS location_source VARCHAR(20) NOT NULL DEFAULT 'current';

COMMIT;
