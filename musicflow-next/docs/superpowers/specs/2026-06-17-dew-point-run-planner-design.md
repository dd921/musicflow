# Dew-Point Run Planner (musicflow-next) — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)
**Where it lives:** New feature inside the `musicflow-next` app (`~/Dev/musicflow/musicflow-next`).

## Goal

Help plan marathon-training runs around heat stress, and enrich run history with
the conditions each run was done in. Two halves:

1. **Forecast / planning** — for saved locations, a 7-day hourly forecast ranked
   by a dew-point comfort score, surfacing the best time windows to run within
   the user's runnable hours.
2. **History** — past runs (synced from Strava) get per-km weather including dew
   point, and a comfort badge, so the user can see how heat/humidity tracked with
   their running.

v1 uses the **standard runner's dew-point comfort scale** (no personalization).

## Why musicflow-next (and not run-analyzer or the Flask app)

The same planner was already built and merged in `run-analyzer`, but
`musicflow-next` is the more mature, preferred-stack running app: Next.js 16 +
React 19, **Prisma** (Postgres), **NextAuth v5**, **shadcn/ui**, Leaflet maps and
Plotly charts, Strava OAuth + sync, vitest. It is the better long-term home, so
the planner is being ported here. run-analyzer's version is superseded but left
as-is (not modified). The legacy Flask `musicflow` app is untouched.

### What ports verbatim from run-analyzer

These are pure, dependency-free TypeScript and copy over unchanged (with their
tests):

- `dewpoint-score.ts` — the comfort scale
- `forecast.ts` — Open-Meteo forecast URL / parse / best-window / group-by-day
- `geocode.ts` — Open-Meteo geocoding
- `open-meteo.ts` archive helpers — `sampleGpsPoints`, `buildWeatherUrl` (incl.
  `dew_point_2m`), `parseWeatherResponse`, `fetchWeatherForSamples`

### What is new / adapted for musicflow-next's stack

- Data layer on **Prisma** (not raw SQL): `SavedLocation` model, `Activity.weather`,
  `User` runnable-hours fields.
- Auth via **NextAuth** `auth()` (not the run-analyzer cookie session).
- **Weather enrichment** wired to their Strava streams + Prisma.
- UI on **shadcn** components and their existing nav.

### Existing musicflow-next infra we reuse

- `auth()` from `@/auth` → `session.user.id` (route auth pattern already in
  `src/app/api/sync/strava/route.ts`).
- `getValidToken(userId, "strava")` from `@/lib/tokens`.
- `fetchActivityStreams(accessToken, stravaActivityId)` from `@/lib/strava`
  (keys: `time,heartrate,velocity_smooth,altitude,cadence,watts,latlng`,
  `key_by_type=true`) — **stream fetching already exists**; we don't build it.
- `prisma` client from `@/lib/prisma`; `polyline.ts`; shadcn `card`/`badge`/
  `dialog`/`button`/`input`/`label`; `bottom-nav.tsx` + `sidebar.tsx`.

## Architecture

```
/planner (server page)
   -> auth(); load SavedLocation[] for user, User.runStartHour/runEndHour
   -> client: location switcher (+ inline add/remove), runnable-hours control
   -> GET /api/forecast?locationId=N
        -> fetch Open-Meteo forecast (cached ~1h) -> score -> best window
   -> 7-day color-coded grid

Activities page
   -> per run: dew-point comfort badge from Activity.weather
   -> "Enrich weather" button -> POST /api/weather/enrich

Enrichment (POST /api/weather/enrich)
   -> for each Activity with weather = null:
        fetchActivityStreams -> store Activity.streams
        -> GPS sample per km -> Open-Meteo archive (incl dew point)
        -> store samples in Activity.weather
      throttled; returns { enriched, skipped }
```

## Data model (Prisma)

Migrations created via the project's Prisma workflow (`prisma migrate dev`).

New model:

```prisma
model SavedLocation {
  id        String   @id @default(cuid())
  userId    String
  name      String
  lat       Float
  lng       Float
  timezone  String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

`Activity` — add:

```prisma
  weather Json?
```

(`streams Json?` already exists; enrichment populates it.)

`User` — add:

```prisma
  runStartHour  Int  @default(5)
  runEndHour    Int  @default(21)
```

and the back-relation `savedLocations SavedLocation[]`.

### Weather sample shape (stored in `Activity.weather`)

A JSON array of objects, matching run-analyzer's `WeatherSample`:

```ts
{
  distance_meters: number; lat: number; lng: number; timestamp: number;
  temp_f: number; humidity_pct: number; wind_speed_mph: number;
  wind_direction: number; precipitation_mm: number; feels_like_f: number;
  dew_point_f: number;
}
```

`null` = not yet enriched.

## Libraries

Ported pure modules under `src/lib/weather/`:

- `dewpoint-score.ts` — `scoreDewPoint(dewPointF) -> { band, label, color, advice }`,
  standard °F scale (<50 Ideal … ≥75 Dangerous), inclusive-lower/exclusive-upper.
- `forecast.ts` — `buildForecastUrl`, `parseForecast`, `selectBestWindow`,
  `groupByDay`, `fetchForecast` (HTTP cache `revalidate: 3600`).
- `geocode.ts` — `buildGeocodeUrl`, `parseGeocode`, `searchLocations`
  (exports `GeocodeResult`).
- `open-meteo.ts` — `sampleGpsPoints`, `buildWeatherUrl` (hourly incl.
  `dew_point_2m`), `parseWeatherResponse` (returns `dew_point_f`),
  `fetchWeatherForSamples`.

Types: a local `src/lib/weather/types.ts` (or colocated) for `DewPointComfort`,
`ForecastHour`, `ForecastDay`, `WeatherSample` — these are app-internal types, not
Prisma models.

New modules:

- `src/lib/weather/enrich.ts` — `enrichActivitiesWeather(userId)`:
  - Query `prisma.activity.findMany({ where: { userId, weather: { equals: Prisma.JsonNull } } })` (activities lacking weather).
  - Get a valid Strava token via `getValidToken(userId, "strava")`; if none, return `{ enriched: 0, skipped: 0, error }`.
  - For each activity: `fetchActivityStreams`; if no `latlng`/`time`/`distance`, skip. Build absolute UNIX timestamps as `floor(startDate/1000) + time[i]`. Update `Activity.streams`. Sample per km, `fetchWeatherForSamples`, update `Activity.weather`. Throttle ~250ms between activities. Catch per-activity errors → `skipped++`.
  - Return `{ enriched, skipped }`. Idempotent (skips activities that already have weather).
- `src/lib/activities-comfort.ts` — `summarizeActivityComfort(samples) -> DewPointComfort | null` (average dew point → `scoreDewPoint`; null when no samples have dew point).

## API routes (NextAuth + Prisma)

All call `const session = await auth()` and return 401 if `!session?.user?.id`;
all queries are scoped by `userId`.

- `GET /api/locations` — list user's SavedLocation.
- `POST /api/locations` — body `{ name }` → return `{ candidates }` from
  `searchLocations`; or `{ name, lat, lng, timezone }` → create and return it (201).
- `DELETE /api/locations/[id]` — delete where `{ id, userId }` (Next 16 async
  `params`).
- `GET /api/forecast?locationId=` — load owned location (404 if not owned);
  `fetchForecast(lat, lng, timezone, user.runStartHour, user.runEndHour)`; 502 on
  Open-Meteo failure.
- `POST /api/weather/enrich` — `enrichActivitiesWeather(session.user.id)`.
- `PUT /api/preferences` — body `{ run_start_hour?, run_end_hour? }`, clamp 0-23,
  update `User`.

## UI (shadcn)

- `/planner` (`src/app/planner/page.tsx` server + `planner-client.tsx` client):
  - Runnable-hours control (two hour selects) → `PUT /api/preferences`.
  - Location switcher (shadcn select/buttons) with **inline add** via a shadcn
    `dialog` (city search → geocode candidates → save) and remove.
  - 7-day grid: rows = days, hour cells color-coded by comfort band, runnable
    window emphasized, best hour per day called out. Empty state when no
    locations.
- Nav: add a "Planner" entry (lucide icon, e.g. `CloudSun`) to both
  `src/components/bottom-nav.tsx` and `src/components/sidebar.tsx`.
- Activities page (`src/app/activities/page.tsx`): dew-point comfort `badge` per
  run (from `Activity.weather` via `summarizeActivityComfort`; "—" when null) and
  an **"Enrich weather"** button (client component) → `POST /api/weather/enrich`
  → `router.refresh()`.

## Error handling

- Unauthenticated API calls → 401; planner/activities pages redirect to sign-in
  per existing app behavior.
- No saved locations → planner empty state prompting to add one.
- Open-Meteo forecast/geocode failure → friendly inline error.
- Enrichment: missing Strava token → returned error; per-activity failures logged
  and skipped; reports `{ enriched, skipped }`.

## Testing (vitest, already configured in musicflow-next)

Port verbatim and adapt import paths:

- `dewpoint-score` — band boundaries (49/50, 54/55, 74/75), label/color/advice.
- `forecast` — URL building, parse with °F conversion + comfort, best-window
  (respects runnable hours, tie-break on feels-like, empty window → null),
  group-by-day.
- `geocode` — URL build, parse mapping, empty results.
- `open-meteo` — `dew_point_2m` in URL and `dew_point_f` in parsed output.
- `activities-comfort` — average → band; null when no dew point.

Enrichment, routes, and UI are verified manually (matches musicflow-next's
existing posture: pure logic unit-tested, IO/UI manual).

## Out of scope (v1)

- Personalized comfort thresholds from the user's own pace/HR.
- Composite multi-factor scoring; v1 is dew-point-led.
- Contiguous best-block detection (single best hour per day for v1).
- Persisting/caching forecasts in the DB (HTTP cache only).
- Notifications/alerts.
- Modifying run-analyzer or the legacy Flask app.
