# Emergency Shelter Allocation Platform

A full-stack disaster-response web application that helps a person find the **most suitable
available emergency shelter** for their situation — not merely the nearest one.

> **Demonstration system.** Every shelter record, contact number and occupancy figure in this
> project is fictional data created for academic demonstration. These are not real emergency
> facilities. In a real emergency in India, call **112**.

---

## Table of contents

1. [Overview](#1-overview)
2. [Problem statement](#2-problem-statement)
3. [Features](#3-features)
4. [Technology stack](#4-technology-stack)
5. [Architecture](#5-architecture)
6. [Project structure](#6-project-structure)
7. [Prerequisites](#7-prerequisites)
8. [Installation](#8-installation)
9. [Environment variables](#9-environment-variables)
10. [Database setup](#10-database-setup)
11. [Running the project](#11-running-the-project)
12. [Demo credentials](#12-demo-credentials)
13. [The allocation algorithm](#13-the-allocation-algorithm)
14. [API reference](#14-api-reference)
15. [Maps and routing](#15-maps-and-routing)
16. [Database schema](#16-database-schema)
17. [Testing](#17-testing)
18. [Security notes](#18-security-notes)
19. [Known limitations](#19-known-limitations)
20. [Future improvements](#20-future-improvements)

---

## 1. Overview

When a disaster strikes, the instinct is to send people to the closest shelter. That is often the
wrong answer. The closest shelter may be full, temporarily closed, structurally unsuited to the
hazard, or missing the medical care a particular group needs.

This platform treats shelter assignment as a **constrained ranking problem** rather than a
proximity search. It runs in two distinct phases:

1. **Hard filters** eliminate every shelter that physically cannot take the group. These shelters
   are removed from the result set entirely — never ranked, never shown as an option.
2. **Weighted scoring** ranks the survivors out of 100 across five factors, with the weights
   shifting according to the emergency's priority level.

Every recommendation returns its own score breakdown, so the ranking is explainable rather than
an opaque number.

---

## 2. Problem statement

During flood, earthquake, fire, cyclone and landslide events, displaced people need shelter
quickly. Existing tools generally present a map of nearby shelters sorted by distance. This
produces three recurring failures:

- **Wasted journeys.** People travel to a shelter that is already full or closed.
- **Unmet needs.** A group with an injured member, young children or elderly relatives is sent
  somewhere with no medical support or accessibility provision.
- **Unsuitable buildings.** A shelter appropriate for flooding may be dangerous during an
  earthquake.

The system addresses these by modelling capacity, facilities, disaster suitability and
operational status as first-class data, and by making the allocation logic transparent and
auditable.

---

## 3. Features

### For people seeking shelter
- Email and password registration with JWT sessions
- Emergency request form with device geolocation **or** map pin-drop (coordinates are never typed
  by hand)
- Disaster type and priority selection
- Group composition capture — total people, children, senior citizens, women — where the
  categories are allowed to overlap
- Facility requirements (medical, food, water, toilets, electricity, women-friendly,
  child-friendly, accessibility, security, pet-friendly)
- Ranked shelter recommendations with a per-shelter score breakdown
- Interactive map with the user's position, ranked shelters and real road routing
- Detailed shelter pages with live capacity, facilities, disaster ratings and accessibility notes
- Full request history; every request stores the ranking produced at the time
- Request cancellation

### For administrators
- Operations dashboard: shelter counts by status, network capacity and occupancy, active and
  critical request counts, people awaiting shelter
- Full shelter CRUD with a map-based location picker
- Inline occupancy editing directly in the shelter table
- Facility and per-hazard disaster-suitability editing
- Shelter deactivation (reversible) and deletion (blocked when historical requests reference it)
- Emergency request monitoring, filterable by priority and status
- Request status management
- User management: grant or revoke administrator access, deactivate accounts

### System-wide
- Role-based authorisation enforced server-side
- Derived `available_capacity` and shelter status — never hand-maintained
- Explicit loading, empty and error states throughout
- Responsive from 390 px phones to desktop
- Keyboard-accessible with visible focus rings, skip link and reduced-motion support

---

## 4. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, Vite 5 |
| Maps | Leaflet 1.9 + React-Leaflet 4, OpenStreetMap tiles |
| Routing | OSRM (public demo server), with a documented fallback |
| Styling | Hand-written CSS design system with custom properties |
| Backend | Node.js 18+, Express 4 |
| Database | PostgreSQL 14+ (PostGIS-ready, not required) |
| Auth | JWT (`jsonwebtoken`), bcrypt password hashing (`bcryptjs`) |
| Validation | Zod schemas on every write endpoint |
| Security | Helmet, CORS allowlist, express-rate-limit |

No CSS framework is used. The interface is built on a small token system (see
`frontend/src/styles/global.css`) so the visual language stays consistent and the bundle stays
small.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser — React SPA (Vite)                              │
│  Pages · Components · AuthContext · ToastContext         │
│  Leaflet map layer                                       │
└───────────────────────────┬──────────────────────────────┘
                            │  REST + JWT Bearer
┌───────────────────────────▼──────────────────────────────┐
│  Express API                                             │
│  routes/ ──► middleware/ (auth, validate, errors)        │
│           └► controllers/ ──► services/                  │
│                                ├─ auth.service           │
│                                ├─ shelter.service        │
│                                ├─ recommendation.service │
│                                └─ allocation.engine ◄─────── pure functions,
└───────────────────────────┬──────────────────────────────┘      no I/O
                            │  parameterised SQL (pg Pool)
┌───────────────────────────▼──────────────────────────────┐
│  PostgreSQL                                              │
│  users · shelters · facilities · disaster_types          │
│  shelter_facilities · shelter_disaster_support           │
│  emergency_requests · request_recommendations            │
│  Generated columns + triggers keep capacity/status true  │
└──────────────────────────────────────────────────────────┘
```

**Design decision — the allocation engine is pure.** `allocation.engine.js` performs no database
access and no I/O. It receives a normalised request plus an array of candidate shelters and
returns a ranking. This makes the scoring deterministic, unit-testable without a database, and
reusable by both the "save this request" endpoint and the stateless preview endpoint.

---

## 6. Project structure

```
Emergency-Shelter-Allocation-Platform/
│
├── backend/
│   ├── scripts/
│   │   ├── setup-db.js            # creates the database + applies schema
│   │   ├── seed-db.js             # reference data, demo shelters, demo accounts
│   │   ├── test-engine.js         # 31 allocation-engine unit tests
│   │   └── test-api.js            # 54 end-to-end API tests
│   ├── src/
│   │   ├── config/                # env loading, pg pool
│   │   ├── controllers/           # auth, shelter, request, admin
│   │   ├── middleware/            # authenticate, authorize, validate, errors
│   │   ├── routes/                # REST route definitions
│   │   ├── services/
│   │   │   ├── allocation.engine.js      # ◄ the scoring algorithm
│   │   │   ├── auth.service.js
│   │   │   ├── recommendation.service.js
│   │   │   └── shelter.service.js
│   │   ├── utils/                 # ApiError, asyncHandler, jwt
│   │   ├── validators/schemas.js  # Zod schemas
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── scripts/ui-test.mjs        # 36 browser tests (Puppeteer)
│   ├── src/
│   │   ├── api/client.js          # fetch wrapper, endpoint map
│   │   ├── components/            # Ui, Layout, Maps, ShelterRecord, ProtectedRoute
│   │   ├── context/               # AuthContext, ToastContext
│   │   ├── pages/
│   │   │   ├── admin/             # 6 administrator screens
│   │   │   └── ...                # Landing, Login, Register, Dashboard, etc.
│   │   ├── styles/global.css      # design system
│   │   ├── utils/                 # constants, format, geo
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── database/
│   ├── schema/
│   │   ├── 001_init.sql               # tables, enums, constraints, triggers
│   │   └── 002_postgis_optional.sql   # optional PostGIS upgrade
│   └── seeds/
│       ├── 001_reference_data.sql     # disaster types + facility catalogue
│       └── 002_demo_shelters.sql      # 14 fictional Bengaluru shelters
│
├── .gitignore
└── README.md
```

---

## 7. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18 or newer | 20 LTS recommended |
| npm | 9 or newer | ships with Node |
| PostgreSQL | 14 or newer | must be running before setup |

Check your versions:

```bash
node --version
npm --version
psql --version
```

PostGIS is **not** required. The platform computes distance with a haversine implementation and
runs on stock PostgreSQL.

---

## 8. Installation

```bash
# 1. Extract the archive and enter the project
cd Emergency-Shelter-Allocation-Platform

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install
```

---

## 9. Environment variables

### Backend

```bash
cd backend
cp .env.example .env
```

Then edit `backend/.env`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Environment name |
| `PORT` | no | `5000` | API port |
| `DATABASE_URL` | no | — | Full connection string; overrides the fields below |
| `DB_HOST` | no | `localhost` | Database host |
| `DB_PORT` | no | `5432` | Database port |
| `DB_NAME` | no | `esap` | Database name |
| `DB_USER` | no | `postgres` | Database user |
| `DB_PASSWORD` | no | `postgres` | Database password |
| `DB_SSL` | no | `false` | Set `true` for hosted Postgres |
| `JWT_SECRET` | **yes** | — | Signing secret; the server refuses to start without it |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime |
| `BCRYPT_ROUNDS` | no | `10` | Password hashing cost |
| `CORS_ORIGINS` | no | `http://localhost:5173,http://localhost:3000` | Allowed frontend origins |
| `GOOGLE_CLIENT_ID` | no | *(blank)* | Leave blank to disable Google sign-in |
| `OSRM_BASE_URL` | no | `https://router.project-osrm.org` | Routing service |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | see below | Override the seeded admin |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | no | see below | Override the seeded user |

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend

```bash
cd frontend
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `/api` | API base. The default works because Vite proxies `/api` to port 5000 |
| `VITE_OSRM_URL` | `https://router.project-osrm.org` | Routing service used by the map |

---

## 10. Database setup

Make sure PostgreSQL is running, then from the `backend` directory:

```bash
npm run db:setup    # creates the "esap" database and applies the schema
npm run db:seed     # loads reference data, 14 demo shelters and demo accounts
```

Or do both at once:

```bash
npm run db:reset
```

`db:setup` creates the database only if it does not already exist, then applies every file in
`database/schema/` in order. `db:seed` is safe to re-run: if shelters are already present it skips
the shelter seed and only refreshes the demo accounts.

### Optional: PostGIS

Location columns are designed for a PostGIS upgrade. If the extension is available:

```bash
psql -U postgres -d esap -f database/schema/002_postgis_optional.sql
```

This adds generated `geography(Point, 4326)` columns and GiST indexes to `shelters` and
`emergency_requests`. Nothing in the application requires them — the migration exists so the
schema can scale to spatial queries without restructuring.

---

## 11. Running the project

Two terminals.

**Terminal 1 — backend:**

```bash
cd backend
npm run dev        # or: npm start
```

Expected output:

```
[db] connected to esap
[api] listening on http://localhost:5000
[api] environment: development
[api] google auth: disabled (no client id)
```

If the database is unreachable the server exits immediately with instructions rather than
starting in a broken state.

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Then open **http://localhost:5173**.

To build and preview a production bundle:

```bash
cd frontend
npm run build
npm run preview     # note: set VITE_API_URL to the full API URL for preview,
                    # since the dev-server proxy does not apply to `preview`
```

---

## 12. Demo credentials

Created by `npm run db:seed`. **These are development credentials for evaluating this academic
project. Change them before deploying anywhere.**

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@esap.local` | `Admin@12345` |
| User | `user@esap.local` | `User@12345` |

Both are also available as one-click buttons on the login page. Override them with the
`SEED_ADMIN_*` and `SEED_USER_*` environment variables before seeding.

---

## 13. The allocation algorithm

Implemented in `backend/src/services/allocation.engine.js`.

### Phase 1 — hard filters (elimination)

A shelter is removed from the result set entirely if **any** of these hold. It is never ranked and
never displayed as an option; instead it is returned in an `excluded` array with a machine-readable
reason and a human-readable label.

| Reason code | Condition |
|---|---|
| `inactive` | Shelter has been deactivated by an administrator |
| `closed` | Status is `closed` |
| `full` | Status is `full` |
| `no_capacity` | `available_capacity <= 0` |
| `insufficient_capacity` | `available_capacity < totalPeople` |
| `unsuitable_for_disaster` | Disaster suitability below `0.30` |
| `out_of_range` | Distance exceeds the priority's `maxDistanceKm` |
| `missing_critical_medical` | A **critical** request that explicitly asked for medical support, at a shelter with no medical facility |

Shelters with no rating for the requested hazard are assumed to be `0.45` suitable — partially
usable, not excluded outright.

### Phase 2 — weighted scoring (ranking)

Each surviving shelter is scored `0–100`. Base weights:

| Factor | Weight | What it measures |
|---|---|---|
| Distance | 30% | Smooth decay: `1 / (1 + d/reach)`, tapered by the priority's maximum range |
| Facilities | 25% | Weighted coverage of requested facilities; critical ones count double |
| Capacity | 20% | Real headroom left *after* the group is admitted, saturating at 30% |
| Disaster suitability | 20% | Per-hazard rating for the building, `0.00–1.00` |
| Readiness | 5% | Operational status, plus bonuses for child/women/accessibility provision when the group includes those people |

### Priority profiles

Priority re-weights distance against facility quality, then the whole weight vector is
**renormalised so it still sums to 1**. A critical emergency prioritises getting people somewhere
fast; a low-priority request allows a better-equipped shelter further away to win.

| Priority | Distance ×| Facility ×| `reachKm` | `maxDistanceKm` |
|---|---|---|---|---|
| Critical | 1.60 | 0.70 | 4 | 25 |
| High | 1.30 | 0.85 | 6 | 35 |
| Medium | 1.00 | 1.00 | 9 | 50 |
| Low | 0.80 | 1.15 | 12 | 60 |

`reachKm` is the distance at which the distance score falls to roughly 0.5.

### Ordering

Deterministic: **score descending → distance ascending → id ascending**. Identical inputs always
produce an identical ranking.

### Transparency

Every recommendation carries a `breakdown` object with the score, applied weight and a
human-readable value for each of the five factors, plus `matchedFacilities` and
`missingFacilities`. The interface surfaces this behind a "Why this score?" control, and the
results page shows missing requirements struck through rather than hiding them.

---

## 14. API reference

Base URL: `http://localhost:5000/api`

All responses are `{ "success": true, "data": {...} }` or
`{ "success": false, "error": { "message", "code", "details" } }`.
Protected routes need `Authorization: Bearer <token>`.

### Authentication — `/api/auth`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/config` | — | Reports which optional providers are configured |
| POST | `/register` | — | Create an account, returns a token |
| POST | `/login` | — | Sign in, returns a token |
| POST | `/logout` | user | Client discards the token |
| GET | `/me` | user | Current profile |
| PATCH | `/me` | user | Update name and phone |
| POST | `/change-password` | user | Change password |

### Shelters — `/api/shelters`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/reference-data` | — | Disaster types and facility catalogue |
| GET | `/` | user | List shelters; supports `search`, `status`, `disasterCode`, `latitude`, `longitude`, `limit`, `offset` |
| GET | `/:id` | user | Full shelter detail |

### Emergency requests — `/api/emergency-requests`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | user | Submit a request; runs the engine and persists the ranking |
| GET | `/` | user | The caller's own requests |
| GET | `/:id` | owner or admin | Request plus its stored ranking |
| POST | `/:id/cancel` | owner | Cancel a pending or allocated request |

### Recommendations — `/api/recommendations`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/preview` | user | Run the engine and return a ranking **without** saving anything |

### Administration — `/api/admin` *(admin role required on every route)*

| Method | Path | Purpose |
|---|---|---|
| GET | `/stats` | Dashboard statistics |
| GET | `/shelters` | List shelters including inactive |
| POST | `/shelters` | Create a shelter |
| PATCH | `/shelters/:id` | Update a shelter |
| PATCH | `/shelters/:id/occupancy` | Update occupancy only |
| POST | `/shelters/:id/deactivate` | Soft delete |
| DELETE | `/shelters/:id` | Hard delete; refused (409) if referenced by a request |
| GET | `/requests` | All requests; filter by `priority`, `status` |
| GET | `/requests/:id` | Request detail with ranking |
| PATCH | `/requests/:id/status` | Update request status |
| GET | `/users` | User list (no phone numbers, no hashes) |
| PATCH | `/users/:id` | Change role or active status |

### Other

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness plus database connectivity |
| GET | `/api` | Endpoint index |

---

## 15. Maps and routing

- **Tiles:** OpenStreetMap raster tiles via Leaflet. No API key required.
- **Markers:** All markers are styled `DivIcon`s, so no image assets are needed and Leaflet's
  well-known bundler icon issue does not arise.
- **Routing:** Real road geometry is requested from OSRM
  (`/route/v1/driving/...?overview=full&geometries=geojson`) and drawn as a polyline, together
  with the true road distance and estimated driving time.

**On honesty about routing.** If OSRM is unreachable or returns no route, the application draws
**nothing** on the map and displays an explicit warning stating that no route could be calculated,
alongside a link that opens the journey in OpenStreetMap's own directions tool. A straight line is
never drawn and labelled as a route. The relevant code is `fetchRoute` and
`externalDirectionsUrl` in `frontend/src/utils/geo.js`, and the `RouteStatus` component in
`frontend/src/components/Maps.jsx`.

**Google sign-in.** The schema, the `google_id` column and the frontend wiring exist. Because
OAuth requires credentials that cannot be bundled, the API reports
`googleAuthEnabled: false` when `GOOGLE_CLIENT_ID` is blank, and the frontend **hides the button
entirely** rather than showing a control that cannot work. Email and password authentication is
fully implemented.

---

## 16. Database schema

Eight tables.

| Table | Purpose |
|---|---|
| `users` | Accounts, bcrypt hashes, role enum, active flag |
| `disaster_types` | Reference list of hazards |
| `facilities` | Facility catalogue with an `is_critical` flag |
| `shelters` | Core shelter records with capacity and location |
| `shelter_facilities` | Many-to-many: shelter ↔ facility |
| `shelter_disaster_support` | Per-hazard suitability, `0.00–1.00` |
| `emergency_requests` | Submitted requests and their allocation |
| `request_recommendations` | The ranking stored per request, with a JSONB breakdown |

### Two invariants enforced by the database, not the application

**1. `available_capacity` is a generated column.**

```sql
available_capacity INTEGER GENERATED ALWAYS AS
  (GREATEST(total_capacity - current_occupancy, 0)) STORED
```

It can never drift from the underlying figures, because it is not stored separately.

**2. Shelter status is derived by a trigger.**

`sync_shelter_status()` sets status from the free-capacity ratio: `full` at 0%, `limited` below
20%, otherwise `available`. An administrator's `closed` decision is always preserved and never
overwritten automatically.

Also present: `updated_at` triggers on all mutable tables, check constraints on latitude,
longitude, capacity and the group-composition counts, cascading foreign keys, and indexes on
status, location, user, priority and creation time.

**On overlapping group categories.** `children_count`, `senior_count` and `women_count` are each
constrained to be no greater than `total_people`, but their **sum is deliberately unconstrained** —
a woman may also be a senior citizen. Forcing the categories to add up would produce incorrect
data.

---

## 17. Testing

Three suites, all runnable locally.

### Allocation engine — 31 unit tests

```bash
cd backend
npm run test:engine
```

No database or server needed. Covers haversine geometry, all eight hard-filter conditions, ranking
behaviour (nearby vs. better-equipped, priority shifts, facility gaps, disaster reordering),
scoring invariants (0–100 bounds, weights summing to 100% after renormalisation, determinism) and
edge cases (empty input, every shelter unusable, result capping).

### API — 54 end-to-end tests

```bash
# terminal 1
cd backend && npm start

# terminal 2
cd backend && node ./scripts/test-api.js
```

Covers registration and login validation, token rejection, role-based access control, shelter
listing and distance annotation, the full request-to-recommendation flow, exclusion reporting,
admin CRUD, the status transitions triggered by occupancy changes, referential-integrity refusal
on delete, immediate access loss on user deactivation, and error handling.

### Browser — 36 UI tests

```bash
# terminals 1 and 2: backend on :5000, frontend dev server on :5173
cd frontend
CHROME_PATH=/path/to/chrome node ./scripts/ui-test.mjs
```

Drives a real Chrome instance through registration, map pin-drop, request submission, rank and
score verification, the score-breakdown panel, shelter browsing and filtering, admin sign-in,
inline occupancy editing, shelter creation, user management, mobile layout at 390 px, horizontal
overflow, and sign-out route protection. It also asserts that the run produces **no unexpected
console errors**. Screenshots are written to `/tmp/shots`.

`CHROME_PATH` must point at a Chrome or Chromium binary. The suite uses `puppeteer-core`, which
deliberately does not download a browser.

**Current status: 31/31, 54/54 and 36/36 passing.**

---

## 18. Security notes

- Passwords hashed with bcrypt; hashes are never returned by any endpoint.
- JWTs signed with a required secret; the server refuses to boot without `JWT_SECRET`, and
  enforces a 32-character minimum in production.
- The authenticated user is **re-read from the database on every request**, so a deactivated or
  role-changed account loses access immediately rather than at token expiry.
- Login responses never reveal whether an email exists; a bcrypt comparison runs either way so the
  timing does not leak it either.
- Every SQL statement is parameterised. No query is built by string concatenation from user input.
- Zod validation on every write endpoint; route ID parameters are validated before reaching the
  database.
- Rate limiting: 20 requests per 15 minutes on credential endpoints, 300 per minute globally.
- Helmet security headers and a CORS origin allowlist.
- The admin user list deliberately excludes phone numbers and request contents.
- Administrators cannot change their own role or deactivate themselves.

---

## 19. Known limitations

These are genuine constraints, stated plainly.

1. **The shelter data is fictional.** Fourteen demonstration shelters placed around Bengaluru with
   non-routable placeholder phone numbers. The system is not connected to any real shelter registry.
2. **Google sign-in is not active.** The architecture and database column exist, but without OAuth
   credentials the feature is disabled and the button is hidden. Email and password auth is complete.
3. **Routing depends on a public OSRM demo server.** It is rate-limited and offers no uptime
   guarantee. Failures are reported to the user with an external fallback link rather than being
   masked. Because the development environment had no outbound access to OSRM, the **success path
   of route drawing has not been observed end-to-end** — the failure path and fallback have been
   verified.
4. **Distance is straight-line (haversine), not road distance.** Ranking uses great-circle
   distance; true road distance appears only after a route is requested. In dense urban areas the
   two can differ meaningfully.
5. **No live capacity synchronisation.** Occupancy changes when an administrator updates it. There
   is no automatic check-in system, so figures are as current as the last manual update.
6. **Allocation does not reserve space.** A recommendation does not hold a place. Two people
   submitting simultaneously can both be pointed at the same last available spaces.
7. **No email delivery.** There is no password-reset email or notification system; an
   administrator would reset a password directly.
8. **Single-city demo dataset.** The engine is location-agnostic, but the seed data and default map
   centre are Bengaluru.
9. **Sessions are stateless.** Logout discards the token client-side; there is no server-side
   revocation list, so a stolen token remains valid until it expires. Account deactivation is
   effective immediately, since the user is re-checked per request.

---

## 20. Future improvements

- **Reservation and check-in.** Hold a place for a defined window, with QR-based arrival
  confirmation to keep occupancy accurate automatically.
- **Road-distance ranking.** Use an OSRM matrix call to rank by travel time rather than
  straight-line distance, with haversine as the fallback.
- **Self-hosted routing.** Removes the public-server dependency and the rate limit.
- **Group splitting.** When no single shelter fits, propose a combination that does.
- **Live updates.** WebSocket push so occupancy changes reach open result pages immediately.
- **Offline support.** A service worker caching the last recommendation and map tiles, since
  connectivity is often the first casualty of a disaster.
- **Multilingual interface.** Kannada, Hindi and English at minimum for this region.
- **SMS and IVR access.** Reaching people without a smartphone or data connection.
- **PostGIS-backed queries.** Apply the included migration and move filtering into the database
  for much larger shelter networks.
- **Shelter-operator role.** A third role scoped to updating a single shelter's own occupancy.
- **Audit logging.** Record every administrative change for post-incident review.

---

## Licence

Academic project, provided for educational purposes.

Map data © OpenStreetMap contributors, available under the Open Database Licence.
Routing by Project OSRM.
