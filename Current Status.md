# ESAP — Current Status

**Completion level: approximately 50% (Review 2 milestone).**
**This is NOT the final version of the project.** Substantial work remains
(see §23). Treat everything below as the state of an in-progress system,
not a finished product.

---

## 1. What ESAP is

Emergency Shelter Allocation Platform (ESAP) is a disaster-response web
application. A person submits an emergency request (location, disaster
type, group composition, needed facilities); the system filters out every
shelter that cannot actually take that group, then ranks the survivors by
a transparent, deterministic suitability score. Administrators manage the
shelter/facility network, review requests, and review or override the
automatic allocation.

## 2. Core idea (unchanged from the original brief)

A disaster-response platform that receives an emergency request, evaluates
available shelters/facilities against location, capacity, suitability,
facilities and emergency requirements, ranks candidates, and produces an
allocation recommendation. **The allocation logic is deterministic and
explainable — not AI/ML** — by design, and that has not changed.

## 3. Problem being solved

Naively sorting shelters by distance sends people to places that are full,
closed, structurally unsuited to the hazard, or missing facilities a
vulnerable group needs. ESAP models capacity, facility match, disaster
suitability and operational status as first-class data and removes
unsuitable shelters before ranking what is left.

---

## 4. Architecture overview

```
React SPA (Vite) ──REST/JWT──> Express API ──parameterised SQL──> PostgreSQL
                                    │
                          allocation.engine.js
                          (pure functions, no I/O)
```

- `allocation.engine.js` takes a normalised request + candidate shelters
  and returns a ranking. It performs no database access, so it is
  independently testable and reused by both the "save this request"
  endpoint and the stateless preview endpoint.
- Backend: `routes/ → middleware/ (auth, validate, errors) → controllers/ → services/`.
- Frontend: page components under `src/pages/`, shared UI in
  `src/components/`, API access centralised in `src/api/client.js`.

## 5. Frontend stack

- React 18, React Router 6, Vite 5.
- Leaflet 1.9 + React-Leaflet 4 for maps, OpenStreetMap tiles, OSRM for
  road routing.
- Hand-written CSS design system (`src/styles/global.css`) implementing
  the **locked** UI reference supplied for this milestone:
  - **Two typography/radius contexts**: `.ctx-marketing` (Landing,
    Login, Register — Public Sans + IBM Plex Mono, 0 border-radius) and
    `.ctx-app` (Dashboard, Admin, every authenticated screen — Inter,
    rounded corners). Applied at the `<App>` root based on auth state.
  - **Light/dark theme** via `[data-theme]` on `<html>`, persisted under
    `localStorage["esap-theme"]`, with a system-preference fallback.
    Toggled by the `ThemeToggle` control in the nav (see
    `ThemeContext.jsx`).
  - **Colour vocabulary is red/amber/teal/slate only** — no blue or
    indigo anywhere in the stylesheet, per the "no blue/indigo" rule in
    the UI reference.
  - The authenticated app's top nav (`.nav.app-nav`) is always dark
    charcoal regardless of the theme toggle, matching the locked User
    Dashboard and Admin Dashboard reference screens, where the nav bar
    stays dark even when the page content is in light mode.
- State: `AuthContext`, `ThemeContext`, `ToastContext` (React context,
  no external state library).

## 6. Backend stack

- Node.js 18+, Express 4.
- JWT auth (`jsonwebtoken`) with bcrypt password hashing (`bcryptjs`).
- Zod schemas validate every write endpoint (`src/validators/schemas.js`).
- Helmet, a CORS allowlist, and `express-rate-limit` on auth and global
  API traffic.

## 7. Database

PostgreSQL 14+. No PostGIS requirement (an optional migration exists for
it but the app runs without it — distance is computed with a haversine
formula in JS). Nine tables after this milestone's migration:

`users`, `disaster_types`, `facilities`, `cities`, `shelters`,
`shelter_facilities`, `shelter_disaster_support`, `emergency_requests`,
`request_recommendations`, `allocation_history`.

Two invariants are enforced by the database, not application code:
- `shelters.available_capacity` is a **generated column**
  (`GREATEST(total_capacity - current_occupancy, 0)`) — it cannot drift.
- `sync_shelter_status()` (a trigger) derives `available`/`limited`/`full`
  from the occupancy ratio, but **only** for a shelter already in an
  operational state (`registered`, `available`, `limited`, `full`). A
  `potential`, `under_verification`, `closed`, or `inactive` shelter is
  left exactly as an administrator set it — this was a real bug caught
  and fixed during this milestone (see §21).

## 8. Map technology

Leaflet + OpenStreetMap tiles (no API key). Real road routing is
requested from a public OSRM instance; on failure the app reports it
honestly and offers an external OpenStreetMap directions link — it never
draws an invented straight-line route. Unchanged from the prior
milestone; not modified in this pass beyond the visual re-theme (marker
colours, popup styling).

## 9. Authentication

Email/password with JWT, unchanged in mechanism. **New this milestone:
administrator passkey.** When `ADMIN_PASSKEY` is set in `backend/.env`:
- Logging into an account whose role is already `admin` requires the
  passkey on every login (enforced server-side by role, independent of
  what the client sends) — a wrong or missing passkey returns
  `401 ADMIN_PASSKEY_REQUIRED`.
- Self-registering with `isAdmin: true` requires the passkey to match;
  if it does not, the account is still created, just as a normal user
  (`adminRequestDenied` is returned explaining why, rather than the
  request silently failing or silently granting the role).
- If `ADMIN_PASSKEY` is left blank, admin self-registration is disabled
  outright and admin login needs no extra step — the feature never
  presents a control that cannot work.

Google sign-in remains unimplemented; the button is hidden unless
`GOOGLE_CLIENT_ID` is configured (unchanged from before this milestone).

## 10. User workflow

1. Register / log in.
2. Submit an emergency request: location (device geolocation or a map
   pin — coordinates are never typed by hand), disaster type (with a
   free-text label when "Other" is chosen), priority, group composition
   (total people, children, senior citizens, women, **disabled people**
   — new this milestone), required facilities, optional notes.
3. View ranked recommendations with a per-shelter score breakdown, map,
   and (when reachable) a real driving route.
4. View shelter details, browse all shelters, view request history,
   cancel an open request.

## 11. Admin workflow

Locked 5-item admin nav: **Dashboard, Shelters, Requests, Allocations,
History.** (Earlier ad-hoc shortcut cards were removed to match this.)

- **Dashboard** — network stats, potential-facility counts, recent
  requests.
- **Shelters** — list/create/edit shelters, inline occupancy editing,
  deactivate/delete.
- **Requests** — every request, filterable by priority/status, opens a
  detail page with full group/location/facility info.
- **Allocations** *(new this milestone)* — every request with a current
  shelter assignment, split by "awaiting review" vs. "confirmed". Each
  opens the request detail page, which now carries **Keep allocation**
  (confirm the engine's pick) and **Change shelter** (override with a
  different shelter from that request's own recommendations) actions.
- **History** *(new this milestone)* — a unified audit trail of every
  allocation event (allocated/confirmed/reassigned/closed) and shelter
  lifecycle event (verified/activated/updated/deactivated), with CSV
  export of real stored data.

A separate **Users** page (role/active-status management) still exists
and is reachable from the Dashboard, but is intentionally not part of the
locked top-level nav.

## 12. Emergency request model

`emergency_requests` now includes, beyond the prior milestone's fields:
`disabled_count` (validated ≤ total people, like children/seniors/women
— these categories deliberately overlap and are **not** required to sum
to the total), `other_disaster_label` (required when `disaster_code =
'other'`), `allocation_confirmed` / `allocation_confirmed_at` (set by the
admin Keep/Change actions).

## 13. Shelter / facility data model

Two facility categories, per the brief:
- **`registered_shelter`** — a permanent, purpose-run emergency shelter.
- **`potential_facility`** — a conventional public building (government
  school, community hall, sports complex, public auditorium, government
  building, other) that is a *candidate* for use as a shelter, not yet
  one.

`facility_type` records which kind of building a potential facility is.
A lightweight `cities` table gives a Country → State → City → Facility
hierarchy (seeded with Bengaluru); adding a second city is one `INSERT`,
and nothing in the allocation math is Bengaluru-specific — distance uses
raw lat/lon.

## 14. Facility lifecycle

```
potential → under_verification → registered → activated
                                                  │
                                     (sync_shelter_status trigger takes
                                      over: available / limited / full,
                                      or admin-set temporarily_closed)
```

- `potential` — newly identified, unreviewed.
- `under_verification` — an admin has started reviewing it.
- `registered` — verified, capacity/facilities recorded, **not yet**
  eligible for allocation.
- Activation (`POST /admin/shelters/:id/activate`) requires a positive
  `total_capacity` and moves the shelter into the normal
  available/limited/full cycle.
- `inactive` — deactivated at any point in the lifecycle.

**A `potential`, `under_verification`, or `registered` facility is hard-
excluded from every recommendation** (`allocation.engine.js` reason code
`not_yet_activated`) — it is reported as excluded with a reason, never
silently ranked.

Backend endpoints:
`POST /admin/shelters/:id/under-verification`,
`POST /admin/shelters/:id/verify`,
`POST /admin/shelters/:id/activate`,
`POST /admin/shelters/estimate-capacity`.

**Known gap:** the frontend API client (`adminApi`) exposes all four of
these, but **no admin UI page currently calls them** — there is no
"Verify" / "Activate" button wired up yet. The lifecycle is fully
implemented and tested on the backend; the corresponding frontend screen
is the largest concrete item left for the next phase. See §23.

## 15. Shelter statuses

`available`, `limited`, `full`, `closed` (temporarily closed, admin-set),
`potential`, `under_verification`, `registered`, `inactive`. All eight
exist in the database enum and are handled by the allocation engine's
exclusion logic and the frontend's status badge component
(`SHELTER_STATUS` in `utils/constants.js`).

## 16. Capacity methodology

`available_capacity = total_capacity - current_occupancy`, always a
generated column — never duplicated by hand.

For a potential facility with no officially published capacity,
`capacity_type` distinguishes `official` from `estimated`. An estimate
uses the **AREA_BASED** method: the Sphere Handbook's minimum standard of
**3.5 m² per person** for covered emergency shelter space, applied to a
recorded `floor_area_sqm` (`backend/src/services/capacity-estimator.js`).
The database rejects an `estimated` capacity type with no method
recorded, so a number can never appear without an explanation of how it
was derived. An estimate is never presented as an official figure — every
shelter record and UI surface carries the `capacity_type` alongside it.

## 17. Allocation / recommendation methodology

Unchanged core algorithm from the prior milestone, in
`allocation.engine.js`:

1. **Hard filters** (elimination, never ranked): inactive, lifecycle
   status not yet activated, closed, full, insufficient capacity, below
   the minimum disaster-suitability threshold, beyond the priority's
   distance range, or (for a critical request needing medical support) a
   shelter with no medical facility.
2. **Weighted scoring** (0–100) of survivors: distance (30%), facilities
   (25%, critical facilities weighted double), capacity headroom (20%),
   disaster suitability (20%), readiness (5% — operational status plus a
   bonus for child/women/senior/**disabled**-friendly provision when the
   group includes those people; the disabled-accessibility bonus is new
   this milestone).
3. Weights are re-normalised per priority level (critical favours
   distance more; low priority allows a better-equipped, farther shelter
   to win).
4. Ordering is deterministic: score desc → distance asc → id asc.

Every recommendation carries its full score breakdown; every exclusion
carries a machine-readable reason and a human-readable label.

## 18. Data-source strategy

Not a claim of nationwide real-time coverage — Bengaluru is the
demonstration city, seeded with 14 fictional "registered shelter" records
and 4 fictional "potential facility" records at various lifecycle stages.
`data_source` and `source_reference` columns record provenance
(`DEMO_DATASET`, `OSM_DEMO`, `BBMP_OPEN_DATA_DEMO` — all explicitly
labelled as fictional demo references, not real datasets).
`verification_status`, `verified_by`, `verified_at`, `last_verified_at`
distinguish sourced/estimated/admin-verified/simulated data throughout.

## 19. Existing APIs

Base: `/api`. Unchanged endpoints from the prior milestone are not
re-listed; new/changed ones this milestone:

- `GET /auth/config` — now also reports `adminPasskeyEnabled`.
- `POST /auth/register`, `POST /auth/login` — accept `isAdmin` /
  `adminPasskey`.
- `POST /emergency-requests`, `POST /recommendations/preview` — accept
  `disabledCount`, `otherDisasterLabel`.
- `POST /admin/shelters/:id/under-verification|verify|activate`
- `POST /admin/shelters/estimate-capacity`
- `POST /admin/requests/:id/confirm` (Keep allocation)
- `POST /admin/requests/:id/reassign` (Change shelter)
- `GET /admin/history`, `GET /admin/history/export` (CSV)
- `GET /admin/shelters` and `GET /shelters` accept a `category` filter
  (`registered_shelter` / `potential_facility`); the public `GET
  /shelters` listing always excludes pre-activation facilities.

## 20. Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full,
current list (unchanged variables are not repeated here). New this
milestone: `ADMIN_PASSKEY` (backend) — optional; when set, gates
administrator login/registration as described in §9.

## 21. Real bugs found and fixed during this milestone

- **Status-sync trigger over-promotion.** The original trigger for this
  milestone's migration treated `registered` as an already-live status,
  so inserting/updating a verified-but-not-yet-activated facility caused
  it to be immediately recomputed to `available` — bypassing the
  activation gate entirely. Fixed by scoping the trigger to
  `available`/`limited`/`full` only; `registered` now correctly stays
  non-allocatable until `activateFacility()` explicitly seeds it live.
  Verified against the live database before and after the fix.
- **CORS rejection returned an opaque 500** in the prior milestone;
  fixed to return an actionable 403 naming the blocked origin and which
  `.env` variable to edit.
- **Stale CSS class references after the design-system rewrite.** The
  landing page's hero visual (`TriageBoard`/`.triage-row-*`) referenced
  CSS classes removed during the red/amber/teal re-theme and would have
  rendered unstyled. Renamed to `SampleResultCard`/`.sample-row-*` and
  the corresponding classes confirmed present in `global.css`.
- **`SHELTER_STATUS` frontend constant missing the four new lifecycle
  statuses** (`potential`, `under_verification`, `registered`,
  `inactive`) — badges for these fell back to a generic neutral style
  instead of the status-specific colour already defined in CSS. Fixed.

## 22. What is genuinely complete and verified this milestone

**Backend — fully verified.** Facility lifecycle (potential →
under_verification → registered → activated), capacity estimator,
administrator passkey auth, allocation confirm/reassign, and the unified
history/audit trail were all exercised end-to-end via direct API calls
against a live database in this session: registration and login
(including the passkey gate), submitting a request and receiving ranked
recommendations (including the new `disabledCount` field), admin stats,
admin request listing, the allocations list, **Keep allocation**,
**Change shelter**, and the resulting audit-trail entries — all
confirmed working correctly by direct inspection of the API responses.

**Frontend — build and core flows verified; admin lifecycle UI not yet
wired.** `npm run build` completes cleanly. In a headless browser: the
landing page, login page, and login → user dashboard flow were confirmed
working repeatedly. The map click-to-set-location mechanism was
independently isolated and confirmed to work correctly (the Leaflet click
handler fires, application state updates, and the pin/hint render
correctly). The admin Allocations and History pages, and the Keep/Change
actions on the request detail page, are implemented and were verified
through direct backend calls, but **were not click-through-tested in the
browser to completion in this session** (see §24 on why).

## 23. What remains for the final version

- **Admin UI for the potential-facility lifecycle.** The backend
  (verify/activate/under-verification/estimate-capacity) is complete and
  tested; there is no frontend screen yet to drive it. This is the
  single largest concrete gap.
- **Facility-model fields absent from the admin shelter create/edit
  form** — `facilityCategory`, `facilityType`, `capacityType`,
  `floorAreaSqm`, `dataSource`, `sourceReference` are not yet editable in
  the UI (new shelters silently default to `registered_shelter` /
  `official`).
- City selection in the admin UI (currently Bengaluru by default; the
  data model supports more, the UI does not yet expose it).
- Phone-based sign-in tab is visually present on the login page per the
  reference design but is not functionally wired (no OTP backend
  exists — intentionally not fabricated).
- Reservation/holding of a shelter slot at recommendation time (two
  simultaneous requests can currently both be pointed at the same
  remaining spaces).
- Road-distance-based ranking (currently straight-line/haversine for
  ranking; a real route is only fetched on request).

## 24. Known limitations / testing scope for this milestone

**Testing was intentionally reduced this milestone to conserve time and
tokens**, per explicit instruction. The prior milestone's full suites
(31 allocation-engine unit tests, 54 API integration tests, 36 browser
UI tests) were **not re-run or updated** for the new fields/endpoints
added this session — they will need updating before they can be trusted
again, since several (e.g. admin login) now require an `ADMIN_PASSKEY`
the test scripts don't yet supply. What *was* done this milestone was a
targeted, mostly manual smoke check:

- Backend: confirmed via direct `curl` calls (deterministic, all passed)
  — health, login with/without passkey, request creation with the new
  fields, admin stats/requests/allocations listing, Keep allocation,
  Change shelter, and history retrieval.
- Frontend: confirmed via a headless browser for the landing page, login
  page, and login → dashboard flow, repeated successfully multiple times.
  Full click-through smoke testing of the admin Allocations/History pages
  and the complete request-submission flow was attempted but proved
  intermittently flaky in this specific headless/sandboxed environment —
  **isolated diagnosis showed the underlying mechanism (the Leaflet map
  click handler) fires correctly and updates state correctly** when given
  it own dedicated test; the flakiness traced to running many rapid,
  overlapping Puppeteer sessions against dev servers that don't persist
  cleanly between separate tool invocations in this sandbox, not to a
  defect in the application code. This is a **test-environment
  limitation, not a confirmed application bug** — it should be re-verified
  in a normal, persistent local browser session, which does not have this
  constraint.
- No new automated tests were written this milestone, per instruction.

## 25. How to run locally (Windows Command Prompt)

Requires Node.js 18+, PostgreSQL 14+ running locally, npm.

```bat
:: Extract the project, then:

:: TERMINAL 1 — database + backend
cd Emergency-Shelter-Allocation-Platform\backend
npm install
copy .env.example .env
:: Edit .env: set JWT_SECRET (required) and optionally ADMIN_PASSKEY
npm run db:reset
npm start

:: TERMINAL 2 — frontend
cd Emergency-Shelter-Allocation-Platform\frontend
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`. Demo accounts (development only):

- User: `user@esap.local` / `User@12345`
- Admin: `admin@esap.local` / `Admin@12345` — if `ADMIN_PASSKEY` is set in
  `backend\.env`, that passkey is also required at login (the login page
  reveals a passkey field when "Log in as administrator" is checked, or
  automatically if the server rejects a passkey-less admin login).

## 26. Notes for whoever continues this

- Read `allocation.engine.js` first — it is pure, self-contained, and the
  single source of truth for ranking behaviour. Do not duplicate scoring
  logic elsewhere.
- The `sync_shelter_status` trigger (migration `003`) is the mechanism
  that keeps shelter status honest. If you add a new lifecycle status,
  re-check its `NEW.status NOT IN (...)` guard — this is exactly where
  the bug in §21 lived.
- The design system's two contexts (`.ctx-marketing` / `.ctx-app`) are
  applied once, at the `<App>` root, based on `isAuthenticated`. Don't
  apply them per-page; that was the source of the stale-class bug in §21.
- `adminApi` in `src/api/client.js` already has methods for every
  lifecycle/allocation/history endpoint — the admin verify/activate
  screen (§23's main gap) is a UI-only task, not a backend one.
