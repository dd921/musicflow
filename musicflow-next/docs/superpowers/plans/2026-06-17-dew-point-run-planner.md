# Dew-Point Run Planner (musicflow-next) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dew-point run planner (7-day forecast of best run windows for saved locations) plus per-km dew-point enrichment of Strava run history, inside `musicflow-next`.

**Architecture:** Port run-analyzer's pure weather logic verbatim, adapt the data/auth/UI layers to musicflow-next's stack (Prisma, NextAuth `auth()`, shadcn + their design-system classes, server actions for mutations). Weather enrichment fetches Strava streams (already available via `fetchActivityStreams`), computes per-km samples, and stores them on `Activity.weather`.

**Tech Stack:** Next.js 16 (App Router, `(auth)` route group), React 19, TypeScript, Prisma 7 (Postgres via `@prisma/adapter-pg`), NextAuth v5, vitest, Tailwind v4 + shadcn/ui + lucide.

**Spec:** `docs/superpowers/specs/2026-06-17-dew-point-run-planner-design.md`

**Conventions (verified in-repo):**
- Import alias `@/` → `src/`.
- Tests are **colocated** as `src/**/*.test.ts` (vitest `include: ["src/**/*.test.ts"]`); **no globals** — import `{ describe, it, expect } from "vitest"`.
- DB: `import { prisma } from "@/lib/prisma"`. Prisma client + namespace generated at `@/generated/prisma/client`.
- Auth in routes: `const session = await auth()` (from `@/auth`); 401 if `!session?.user?.id`. Pages under `src/app/(auth)/` are already auth-gated + given nav by `(auth)/layout.tsx`.
- Mutations from pages use **server actions** (`"use server"` + `revalidatePath`), per `activities/page.tsx`'s Sync button.
- Strava: `getValidToken(userId, "strava")` → `Promise<string|null>`; `fetchActivityStreams(token, stravaId: bigint)` → `StravaStreams` (`{ time?:{data:number[]}, latlng?:{data:[number,number][]}, ... }`, `{}` on 404). The streams endpoint does NOT include a distance stream — compute cumulative distance from `latlng`.
- Run all tests: `npm test` (alias for `vitest run`). Single file: `npx vitest run src/lib/weather/forecast.test.ts`.
- Build/lint/typecheck: `npm run build`, `npm run lint`, `npx tsc --noEmit`.

---

## File Structure

**Create:**
- `src/lib/weather/types.ts` — `DewPointComfort`, `WeatherSample`, `ForecastHour`, `ForecastDay`
- `src/lib/weather/dewpoint-score.ts` (+ `.test.ts`)
- `src/lib/weather/open-meteo.ts` (+ `.test.ts`)
- `src/lib/weather/forecast.ts` (+ `.test.ts`)
- `src/lib/weather/geocode.ts` (+ `.test.ts`)
- `src/lib/weather/enrich.ts`
- `src/lib/activities-comfort.ts` (+ `.test.ts`)
- `src/app/api/locations/route.ts`, `src/app/api/locations/[id]/route.ts`
- `src/app/api/forecast/route.ts`
- `src/app/api/preferences/route.ts`
- `src/app/(auth)/planner/page.tsx` + `src/app/(auth)/planner/planner-client.tsx`

**Modify:**
- `prisma/schema.prisma` — `SavedLocation` model, `Activity.weather`, `User` runnable-hours + relation
- `src/components/sidebar.tsx`, `src/components/bottom-nav.tsx` — add Planner nav item
- `src/app/(auth)/activities/page.tsx` — comfort badge + "Enrich weather" server action button

---

## Task 1: Prisma schema + generated client + weather types

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/weather/types.ts`

- [ ] **Step 1: Add models/fields to `prisma/schema.prisma`**

Add the new model (anywhere after the `User` model):

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

In `model Activity`, add this line (the `streams Json?` line already exists — leave it):

```prisma
  weather Json?
```

In `model User`, add these three lines (alongside `units`):

```prisma
  runStartHour   Int             @default(5)
  runEndHour     Int             @default(21)
  savedLocations SavedLocation[]
```

- [ ] **Step 2: Regenerate the Prisma client (offline, no DB needed)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — updates `src/generated/prisma`. (The actual DB migration runs in Task 11 when a database is available.)

- [ ] **Step 3: Create `src/lib/weather/types.ts`**

```ts
export interface DewPointComfort {
  band: number; // 0 (best) .. 6 (worst)
  label: string;
  color: string; // tailwind bg-* class for grid cells / badges
  advice: string;
}

export interface WeatherSample {
  distance_meters: number;
  lat: number;
  lng: number;
  timestamp: number;
  temp_f: number;
  humidity_pct: number;
  wind_speed_mph: number;
  wind_direction: number;
  precipitation_mm: number;
  feels_like_f: number;
  dew_point_f?: number;
}

export interface ForecastHour {
  time: string; // local ISO like "2026-06-17T06:00"
  hour: number; // local hour 0-23
  dew_point_f: number;
  temp_f: number;
  humidity_pct: number;
  feels_like_f: number;
  precipitation_mm: number;
  wind_speed_mph: number;
  comfort: DewPointComfort;
}

export interface ForecastDay {
  date: string; // "YYYY-MM-DD" local
  hours: ForecastHour[];
  bestWindow: ForecastHour | null;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/weather/types.ts src/generated/prisma
git commit -m "feat(planner): add SavedLocation/Activity.weather schema and weather types"
```

---

## Task 2: Dew-point comfort scoring (pure)

**Files:**
- Create: `src/lib/weather/dewpoint-score.ts`, `src/lib/weather/dewpoint-score.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/weather/dewpoint-score.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { scoreDewPoint } from "@/lib/weather/dewpoint-score";

describe("scoreDewPoint", () => {
  it("rates low dew points as ideal", () => {
    const c = scoreDewPoint(45);
    expect(c.band).toBe(0);
    expect(c.label).toBe("Ideal");
  });

  it("uses inclusive lower / exclusive upper band boundaries", () => {
    expect(scoreDewPoint(49.9).band).toBe(0);
    expect(scoreDewPoint(50).band).toBe(1);
    expect(scoreDewPoint(54.9).band).toBe(1);
    expect(scoreDewPoint(55).band).toBe(2);
    expect(scoreDewPoint(60).band).toBe(3);
    expect(scoreDewPoint(65).band).toBe(4);
    expect(scoreDewPoint(70).band).toBe(5);
    expect(scoreDewPoint(74.9).band).toBe(5);
    expect(scoreDewPoint(75).band).toBe(6);
  });

  it("rates very high dew points as dangerous", () => {
    const c = scoreDewPoint(80);
    expect(c.band).toBe(6);
    expect(c.label).toBe("Dangerous");
    expect(c.color).toContain("bg-");
    expect(c.advice.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/weather/dewpoint-score.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/weather/dewpoint-score.ts`**

```ts
import type { DewPointComfort } from "./types";

/**
 * Standard runner's dew-point comfort scale (°F).
 * Lower band is better. Boundaries are inclusive-lower / exclusive-upper.
 */
export function scoreDewPoint(dewPointF: number): DewPointComfort {
  if (dewPointF < 50)
    return { band: 0, label: "Ideal", color: "bg-sky-500", advice: "Hardly noticeable — great conditions for any run." };
  if (dewPointF < 55)
    return { band: 1, label: "Very comfortable", color: "bg-teal-500", advice: "Excellent conditions, including hard efforts." };
  if (dewPointF < 60)
    return { band: 2, label: "Comfortable", color: "bg-green-500", advice: "Fine for most efforts." };
  if (dewPointF < 65)
    return { band: 3, label: "Getting sticky", color: "bg-yellow-500", advice: "Easy effort is fine; ease back on hard workouts." };
  if (dewPointF < 70)
    return { band: 4, label: "Uncomfortable", color: "bg-orange-500", advice: "Expect slower paces and noticeably higher effort." };
  if (dewPointF < 75)
    return { band: 5, label: "Difficult", color: "bg-red-500", advice: "Hard efforts are risky — hydrate and slow down." };
  return { band: 6, label: "Dangerous", color: "bg-purple-700", advice: "Limit intensity or reschedule the run." };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/weather/dewpoint-score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather/dewpoint-score.ts src/lib/weather/dewpoint-score.test.ts
git commit -m "feat(planner): add dew-point comfort scoring"
```

---

## Task 3: Open-Meteo archive helpers (pure, with dew point)

**Files:**
- Create: `src/lib/weather/open-meteo.ts`, `src/lib/weather/open-meteo.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/weather/open-meteo.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  sampleGpsPoints,
  buildWeatherUrl,
  parseWeatherResponse,
} from "@/lib/weather/open-meteo";

describe("sampleGpsPoints", () => {
  it("samples GPS points at approximately 1km intervals", () => {
    const latlngs: [number, number][] = [];
    const distances: number[] = [];
    const timestamps: number[] = [];
    const baseTime = 1700000000;
    for (let i = 0; i < 10; i++) {
      latlngs.push([40.7128 + i * 0.005, -74.006]);
      distances.push(i * 500);
      timestamps.push(baseTime + i * 180);
    }
    const samples = sampleGpsPoints(latlngs, distances, timestamps, 1000);
    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(samples.length).toBeLessThanOrEqual(6);
    expect(samples[0].distance_meters).toBe(0);
    expect(samples[0].lat).toBe(40.7128);
  });
});

describe("buildWeatherUrl", () => {
  it("constructs Open-Meteo archive URL including dew point", () => {
    const url = buildWeatherUrl(40.7128, -74.006, "2024-03-15");
    expect(url).toContain("archive-api.open-meteo.com");
    expect(url).toContain("latitude=40.7128");
    expect(url).toContain("dew_point_2m");
    expect(url).toContain("temperature_2m");
  });
});

describe("parseWeatherResponse", () => {
  it("extracts hourly weather incl dew point, finds closest hour", () => {
    const response = {
      hourly: {
        time: ["2024-03-15T10:00", "2024-03-15T11:00", "2024-03-15T12:00"],
        temperature_2m: [15.0, 16.5, 18.0],
        relative_humidity_2m: [65, 60, 55],
        dew_point_2m: [8.0, 9.0, 10.0],
        wind_speed_10m: [10.0, 12.0, 8.0],
        wind_direction_10m: [180, 190, 200],
        precipitation: [0, 0, 0.5],
        apparent_temperature: [14.0, 15.5, 17.0],
      },
    };
    const result = parseWeatherResponse(response, "2024-03-15T10:30:00Z");
    expect(result.temp_f).toBeCloseTo(59.0, 0);
    expect(result.humidity_pct).toBe(65);
    expect(result.dew_point_f).toBeCloseTo(46.4, 0);
    expect(result.feels_like_f).toBeCloseTo(57.2, 0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/weather/open-meteo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/weather/open-meteo.ts`**

```ts
import type { WeatherSample } from "./types";

interface GpsSample {
  distance_meters: number;
  lat: number;
  lng: number;
  timestamp: number;
}

/**
 * Sample GPS points at approximately `intervalMeters` apart.
 * Always includes the first and last point.
 */
export function sampleGpsPoints(
  latlngs: [number, number][],
  distances: number[],
  timestamps: number[],
  intervalMeters = 1000
): GpsSample[] {
  if (latlngs.length === 0) return [];

  const samples: GpsSample[] = [
    { distance_meters: distances[0], lat: latlngs[0][0], lng: latlngs[0][1], timestamp: timestamps[0] },
  ];
  let lastSampledDist = distances[0];

  for (let i = 1; i < latlngs.length; i++) {
    if (distances[i] - lastSampledDist >= intervalMeters) {
      samples.push({ distance_meters: distances[i], lat: latlngs[i][0], lng: latlngs[i][1], timestamp: timestamps[i] });
      lastSampledDist = distances[i];
    }
  }

  const lastIdx = latlngs.length - 1;
  if (distances[lastIdx] - lastSampledDist > 100) {
    samples.push({ distance_meters: distances[lastIdx], lat: latlngs[lastIdx][0], lng: latlngs[lastIdx][1], timestamp: timestamps[lastIdx] });
  }

  return samples;
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function buildWeatherUrl(lat: number, lng: number, date: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: date,
    end_date: date,
    hourly:
      "temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,precipitation,apparent_temperature",
    timezone: "UTC",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params}`;
}

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    dew_point_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    precipitation: number[];
    apparent_temperature: number[];
  };
}

export function parseWeatherResponse(
  response: OpenMeteoResponse,
  isoTime: string
): Omit<WeatherSample, "distance_meters" | "lat" | "lng" | "timestamp"> {
  const targetHour = new Date(isoTime).getUTCHours();
  const hours = response.hourly.time.map((t) => new Date(t + ":00Z").getUTCHours());

  let closestIdx = 0;
  let minDiff = Math.abs(hours[0] - targetHour);
  for (let i = 1; i < hours.length; i++) {
    const diff = Math.abs(hours[i] - targetHour);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }

  return {
    temp_f: celsiusToFahrenheit(response.hourly.temperature_2m[closestIdx]),
    humidity_pct: response.hourly.relative_humidity_2m[closestIdx],
    wind_speed_mph: kmhToMph(response.hourly.wind_speed_10m[closestIdx]),
    wind_direction: response.hourly.wind_direction_10m[closestIdx],
    precipitation_mm: response.hourly.precipitation[closestIdx],
    feels_like_f: celsiusToFahrenheit(response.hourly.apparent_temperature[closestIdx]),
    dew_point_f: celsiusToFahrenheit(response.hourly.dew_point_2m[closestIdx]),
  };
}

/**
 * Fetch weather for a set of GPS samples. Groups by date to minimize API calls.
 */
export async function fetchWeatherForSamples(samples: GpsSample[]): Promise<WeatherSample[]> {
  const results: WeatherSample[] = [];

  const byDate = new Map<string, GpsSample[]>();
  for (const s of samples) {
    const date = new Date(s.timestamp * 1000).toISOString().slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(s);
  }

  for (const [date, dateSamples] of byDate) {
    const avgLat = dateSamples.reduce((sum, s) => sum + s.lat, 0) / dateSamples.length;
    const avgLng = dateSamples.reduce((sum, s) => sum + s.lng, 0) / dateSamples.length;

    const res = await fetch(buildWeatherUrl(avgLat, avgLng, date));
    if (!res.ok) {
      console.error(`Open-Meteo error for ${date}: ${res.status}`);
      continue;
    }
    const data: OpenMeteoResponse = await res.json();

    for (const sample of dateSamples) {
      const isoTime = new Date(sample.timestamp * 1000).toISOString();
      const weather = parseWeatherResponse(data, isoTime);
      results.push({
        distance_meters: sample.distance_meters,
        lat: sample.lat,
        lng: sample.lng,
        timestamp: sample.timestamp,
        ...weather,
      });
    }
  }

  return results;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/weather/open-meteo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather/open-meteo.ts src/lib/weather/open-meteo.test.ts
git commit -m "feat(planner): add Open-Meteo archive helpers with dew point"
```

---

## Task 4: Forecast lib (pure)

**Files:**
- Create: `src/lib/weather/forecast.ts`, `src/lib/weather/forecast.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/weather/forecast.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  buildForecastUrl,
  parseForecast,
  selectBestWindow,
  groupByDay,
} from "@/lib/weather/forecast";

const sampleResponse = {
  hourly: {
    time: ["2026-06-17T04:00", "2026-06-17T06:00", "2026-06-17T18:00"],
    dew_point_2m: [10.0, 7.0, 20.0], // 50.0, 44.6, 68.0 °F
    temperature_2m: [15.0, 12.0, 25.0],
    relative_humidity_2m: [80, 85, 60],
    apparent_temperature: [14.0, 11.0, 26.0],
    precipitation: [0, 0, 0.2],
    wind_speed_10m: [10.0, 5.0, 15.0],
  },
};

describe("buildForecastUrl", () => {
  it("builds a 7-day hourly forecast URL with dew point and timezone", () => {
    const url = buildForecastUrl(40.0, -75.0, "America/New_York");
    expect(url).toContain("api.open-meteo.com/v1/forecast");
    expect(url).toContain("latitude=40");
    expect(url).toContain("dew_point_2m");
    expect(url).toContain("forecast_days=7");
    expect(url).toContain("America%2FNew_York");
  });
});

describe("parseForecast", () => {
  it("maps hourly arrays to typed hours with °F conversion and comfort", () => {
    const hours = parseForecast(sampleResponse);
    expect(hours).toHaveLength(3);
    expect(hours[0].dew_point_f).toBeCloseTo(50.0, 0);
    expect(hours[0].hour).toBe(4);
    expect(hours[0].comfort.band).toBe(1);
    expect(hours[1].comfort.band).toBe(0);
    expect(hours[2].temp_f).toBeCloseTo(77.0, 0);
  });
});

describe("selectBestWindow", () => {
  it("picks the lowest dew point within runnable hours", () => {
    const best = selectBestWindow(parseForecast(sampleResponse), 5, 21);
    expect(best?.hour).toBe(6);
  });
  it("returns null when no hours fall in the window", () => {
    expect(selectBestWindow(parseForecast(sampleResponse), 0, 3)).toBeNull();
  });
});

describe("groupByDay", () => {
  it("groups hours by local date and attaches best window", () => {
    const days = groupByDay(parseForecast(sampleResponse), 5, 21);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-06-17");
    expect(days[0].hours).toHaveLength(3);
    expect(days[0].bestWindow?.hour).toBe(6);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/weather/forecast.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/weather/forecast.ts`**

```ts
import type { ForecastDay, ForecastHour } from "./types";
import { scoreDewPoint } from "./dewpoint-score";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}
function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function buildForecastUrl(lat: number, lng: number, timezone: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly:
      "dew_point_2m,temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m",
    forecast_days: "7",
    timezone,
  });
  return `${FORECAST_URL}?${params}`;
}

interface ForecastResponse {
  hourly: {
    time: string[];
    dew_point_2m: number[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    apparent_temperature: number[];
    precipitation: number[];
    wind_speed_10m: number[];
  };
}

export function parseForecast(response: ForecastResponse): ForecastHour[] {
  const h = response.hourly;
  return h.time.map((t, i) => {
    const dew_point_f = celsiusToFahrenheit(h.dew_point_2m[i]);
    return {
      time: t,
      hour: parseInt(t.slice(11, 13), 10),
      dew_point_f,
      temp_f: celsiusToFahrenheit(h.temperature_2m[i]),
      humidity_pct: h.relative_humidity_2m[i],
      feels_like_f: celsiusToFahrenheit(h.apparent_temperature[i]),
      precipitation_mm: h.precipitation[i],
      wind_speed_mph: kmhToMph(h.wind_speed_10m[i]),
      comfort: scoreDewPoint(dew_point_f),
    };
  });
}

/** Lowest dew point within [startHour, endHour] inclusive, tie-broken by lower feels-like. */
export function selectBestWindow(
  hours: ForecastHour[],
  startHour: number,
  endHour: number
): ForecastHour | null {
  const inWindow = hours.filter((h) => h.hour >= startHour && h.hour <= endHour);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((best, h) => {
    if (h.dew_point_f < best.dew_point_f) return h;
    if (h.dew_point_f === best.dew_point_f && h.feels_like_f < best.feels_like_f) return h;
    return best;
  });
}

export function groupByDay(
  hours: ForecastHour[],
  startHour: number,
  endHour: number
): ForecastDay[] {
  const byDate = new Map<string, ForecastHour[]>();
  for (const h of hours) {
    const date = h.time.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(h);
  }
  return Array.from(byDate.entries()).map(([date, dayHours]) => ({
    date,
    hours: dayHours,
    bestWindow: selectBestWindow(dayHours, startHour, endHour),
  }));
}

export async function fetchForecast(
  lat: number,
  lng: number,
  timezone: string,
  startHour: number,
  endHour: number
): Promise<ForecastDay[]> {
  const res = await fetch(buildForecastUrl(lat, lng, timezone), {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Open-Meteo forecast error: ${res.status}`);
  const data = (await res.json()) as ForecastResponse;
  return groupByDay(parseForecast(data), startHour, endHour);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/weather/forecast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather/forecast.ts src/lib/weather/forecast.test.ts
git commit -m "feat(planner): add Open-Meteo forecast fetch, parse, best-window"
```

---

## Task 5: Geocoding lib (pure)

**Files:**
- Create: `src/lib/weather/geocode.ts`, `src/lib/weather/geocode.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/weather/geocode.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildGeocodeUrl, parseGeocode } from "@/lib/weather/geocode";

describe("buildGeocodeUrl", () => {
  it("builds a search URL for a place name", () => {
    const url = buildGeocodeUrl("Philadelphia");
    expect(url).toContain("geocoding-api.open-meteo.com/v1/search");
    expect(url).toContain("name=Philadelphia");
  });
});

describe("parseGeocode", () => {
  it("maps results to typed candidates", () => {
    const results = parseGeocode({
      results: [
        { name: "Philadelphia", latitude: 39.9526, longitude: -75.1652, timezone: "America/New_York", admin1: "Pennsylvania", country: "United States" },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].lat).toBeCloseTo(39.9526);
    expect(results[0].timezone).toBe("America/New_York");
  });

  it("returns [] when there are no results", () => {
    expect(parseGeocode({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/weather/geocode.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/weather/geocode.ts`**

```ts
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
  timezone: string;
  admin1?: string;
  country?: string;
}

export function buildGeocodeUrl(name: string): string {
  const params = new URLSearchParams({ name, count: "5", language: "en", format: "json" });
  return `${GEOCODE_URL}?${params}`;
}

interface GeocodeResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    admin1?: string;
    country?: string;
  }>;
}

export function parseGeocode(response: GeocodeResponse): GeocodeResult[] {
  return (response.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lng: r.longitude,
    timezone: r.timezone,
    admin1: r.admin1,
    country: r.country,
  }));
}

export async function searchLocations(name: string): Promise<GeocodeResult[]> {
  const res = await fetch(buildGeocodeUrl(name));
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  return parseGeocode((await res.json()) as GeocodeResponse);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/weather/geocode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather/geocode.ts src/lib/weather/geocode.test.ts
git commit -m "feat(planner): add Open-Meteo geocoding lookup"
```

---

## Task 6: Activity comfort summary (pure)

**Files:**
- Create: `src/lib/activities-comfort.ts`, `src/lib/activities-comfort.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/activities-comfort.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { summarizeActivityComfort } from "@/lib/activities-comfort";
import type { WeatherSample } from "@/lib/weather/types";

function sample(dew: number | undefined): WeatherSample {
  return {
    distance_meters: 0, lat: 0, lng: 0, timestamp: 0,
    temp_f: 0, humidity_pct: 0, wind_speed_mph: 0, wind_direction: 0,
    precipitation_mm: 0, feels_like_f: 0, dew_point_f: dew,
  };
}

describe("summarizeActivityComfort", () => {
  it("scores the average dew point across samples", () => {
    expect(summarizeActivityComfort([sample(48), sample(52)])?.band).toBe(1); // avg 50
  });
  it("returns null when no samples have dew point or input is null", () => {
    expect(summarizeActivityComfort([sample(undefined)])).toBeNull();
    expect(summarizeActivityComfort([])).toBeNull();
    expect(summarizeActivityComfort(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/activities-comfort.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/activities-comfort.ts`**

```ts
import type { DewPointComfort, WeatherSample } from "./weather/types";
import { scoreDewPoint } from "./weather/dewpoint-score";

export function summarizeActivityComfort(
  samples: WeatherSample[] | null
): DewPointComfort | null {
  if (!samples || samples.length === 0) return null;
  const dews = samples
    .map((s) => s.dew_point_f)
    .filter((d): d is number => typeof d === "number" && !Number.isNaN(d));
  if (dews.length === 0) return null;
  const avg = dews.reduce((a, b) => a + b, 0) / dews.length;
  return scoreDewPoint(avg);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/activities-comfort.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activities-comfort.ts src/lib/activities-comfort.test.ts
git commit -m "feat(planner): add activity dew-point comfort summary"
```

---

## Task 7: Weather enrichment (streams + per-km)

**Files:**
- Create: `src/lib/weather/enrich.ts`

No unit test (IO + DB); verified by typecheck and Task 11. Computes cumulative distance from `latlng` (no distance stream available).

- [ ] **Step 1: Implement `src/lib/weather/enrich.ts`**

```ts
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "@/lib/tokens";
import { fetchActivityStreams } from "@/lib/strava";
import { sampleGpsPoints, fetchWeatherForSamples } from "./open-meteo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const aLat = (a[0] * Math.PI) / 180;
  const bLat = (b[0] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Fetch streams + per-km weather (incl dew point) for the user's activities that
 * have no weather yet. Idempotent and throttled. Returns counts.
 */
export async function enrichActivitiesWeather(
  userId: string
): Promise<{ enriched: number; skipped: number; error?: string }> {
  const token = await getValidToken(userId, "strava");
  if (!token) return { enriched: 0, skipped: 0, error: "No valid Strava token" };

  const activities = await prisma.activity.findMany({
    where: { userId, weather: { equals: Prisma.DbNull } },
    select: { id: true, stravaId: true, startDate: true },
  });

  let enriched = 0;
  let skipped = 0;

  for (const act of activities) {
    try {
      const streams = await fetchActivityStreams(token, act.stravaId);
      const latlng = streams.latlng?.data;
      const time = streams.time?.data;
      if (!latlng || !time || latlng.length === 0 || time.length === 0) {
        skipped++;
        continue;
      }

      const startUnix = Math.floor(act.startDate.getTime() / 1000);
      const timestamps = time.map((t) => startUnix + t);

      const distances: number[] = [0];
      for (let i = 1; i < latlng.length; i++) {
        distances.push(distances[i - 1] + haversineMeters(latlng[i - 1], latlng[i]));
      }

      const gps = sampleGpsPoints(latlng, distances, timestamps, 1000);
      const samples = await fetchWeatherForSamples(gps);

      await prisma.activity.update({
        where: { id: act.id },
        data: {
          streams: streams as unknown as Prisma.InputJsonValue,
          weather: samples as unknown as Prisma.InputJsonValue,
        },
      });
      enriched++;
    } catch (e) {
      console.error(`Weather enrich failed for activity ${act.id}:`, e);
      skipped++;
    }
    await sleep(250);
  }

  return { enriched, skipped };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `Prisma.DbNull` or `Prisma.InputJsonValue` is not found at `@/generated/prisma/client`, locate the correct export (check `src/generated/prisma/client.ts` for the `Prisma` namespace) and fix the import path; do not change behavior.

- [ ] **Step 3: Commit**

```bash
git add src/lib/weather/enrich.ts
git commit -m "feat(planner): add Strava streams + per-km weather enrichment"
```

---

## Task 8: API routes (locations, forecast, preferences)

**Files:**
- Create: `src/app/api/locations/route.ts`, `src/app/api/locations/[id]/route.ts`, `src/app/api/forecast/route.ts`, `src/app/api/preferences/route.ts`

- [ ] **Step 1: `src/app/api/locations/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { searchLocations } from "@/lib/weather/geocode";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locations = await prisma.savedLocation.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(locations);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();

  if (
    typeof body.lat === "number" &&
    typeof body.lng === "number" &&
    typeof body.timezone === "string" &&
    typeof body.name === "string"
  ) {
    const loc = await prisma.savedLocation.create({
      data: { userId: session.user.id, name: body.name, lat: body.lat, lng: body.lng, timezone: body.timezone },
    });
    return NextResponse.json(loc, { status: 201 });
  }

  if (typeof body.name === "string" && body.name.trim().length > 0) {
    const candidates = await searchLocations(body.name.trim());
    return NextResponse.json({ candidates });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
```

- [ ] **Step 2: `src/app/api/locations/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.savedLocation.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: `src/app/api/forecast/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchForecast } from "@/lib/weather/forecast";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) return NextResponse.json({ error: "Missing locationId" }, { status: 400 });

  const location = await prisma.savedLocation.findFirst({
    where: { id: locationId, userId: session.user.id },
  });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { runStartHour: true, runEndHour: true },
  });
  const startHour = user?.runStartHour ?? 5;
  const endHour = user?.runEndHour ?? 21;

  try {
    const days = await fetchForecast(location.lat, location.lng, location.timezone, startHour, endHour);
    return NextResponse.json({ location, days });
  } catch (e) {
    console.error("Forecast fetch failed:", e);
    return NextResponse.json({ error: "Weather service unavailable" }, { status: 502 });
  }
}
```

- [ ] **Step 4: `src/app/api/preferences/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();

  const data: { runStartHour?: number; runEndHour?: number } = {};
  if (typeof body.run_start_hour === "number") data.runStartHour = Math.min(23, Math.max(0, body.run_start_hour));
  if (typeof body.run_end_hour === "number") data.runEndHour = Math.min(23, Math.max(0, body.run_end_hour));

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { runStartHour: true, runEndHour: true },
  });
  return NextResponse.json(user);
}
```

- [ ] **Step 5: Build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; `/api/locations`, `/api/locations/[id]`, `/api/forecast`, `/api/preferences` appear as dynamic routes; lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/locations src/app/api/forecast src/app/api/preferences
git commit -m "feat(planner): add locations, forecast, preferences API routes"
```

---

## Task 9: Planner page + nav

**Files:**
- Create: `src/app/(auth)/planner/page.tsx`, `src/app/(auth)/planner/planner-client.tsx`
- Modify: `src/components/sidebar.tsx`, `src/components/bottom-nav.tsx`

- [ ] **Step 1: `src/app/(auth)/planner/page.tsx` (server)**

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlannerClient } from "./planner-client";

export default async function PlannerPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [locations, user] = await Promise.all([
    prisma.savedLocation.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { runStartHour: true, runEndHour: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="rise-in">
        <p className="eyebrow mb-2">Weather</p>
        <h2 className="text-3xl font-bold tracking-tight">Run Planner</h2>
        <p className="text-muted-foreground mt-1">Best times to run, by dew point.</p>
      </div>
      <PlannerClient
        initialLocations={locations}
        initialStartHour={user?.runStartHour ?? 5}
        initialEndHour={user?.runEndHour ?? 21}
      />
    </div>
  );
}
```

- [ ] **Step 2: `src/app/(auth)/planner/planner-client.tsx` (client)**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { ForecastDay } from "@/lib/weather/types";
import type { GeocodeResult } from "@/lib/weather/geocode";

type SavedLocation = { id: string; name: string; lat: number; lng: number; timezone: string };

function fmtHour(h: number): string {
  const am = h < 12;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${am ? "am" : "pm"}`;
}

export function PlannerClient({
  initialLocations,
  initialStartHour,
  initialEndHour,
}: {
  initialLocations: SavedLocation[];
  initialStartHour: number;
  initialEndHour: number;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationId, setLocationId] = useState<string | null>(initialLocations[0]?.id ?? null);
  const [startHour, setStartHour] = useState(initialStartHour);
  const [endHour, setEndHour] = useState(initialEndHour);
  const [days, setDays] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);

  useEffect(() => {
    if (locationId == null) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/forecast?locationId=${locationId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setDays(data.days);
      } catch {
        setError("Could not load the forecast.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [locationId]);

  async function updateHours(start: number, end: number) {
    setStartHour(start);
    setEndHour(end);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_start_hour: start, run_end_hour: end }),
    });
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: search.trim() }),
    });
    const data = await res.json();
    setCandidates(data.candidates ?? []);
  }

  async function saveLocation(c: GeocodeResult) {
    const label = [c.name, c.admin1, c.country].filter(Boolean).join(", ");
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label, lat: c.lat, lng: c.lng, timezone: c.timezone }),
    });
    if (!res.ok) return;
    const loc = await res.json();
    setLocations((prev) => [...prev, loc]);
    if (locationId == null) setLocationId(loc.id);
    setCandidates([]);
    setSearch("");
  }

  async function removeLocation(id: string) {
    await fetch(`/api/locations/${id}`, { method: "DELETE" });
    setLocations((prev) => prev.filter((l) => l.id !== id));
    if (locationId === id) setLocationId(locations.find((l) => l.id !== id)?.id ?? null);
  }

  return (
    <div className="space-y-6">
      {/* Add location */}
      <div className="card-surface rounded-2xl p-4 space-y-3">
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Add a city…"
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium card-surface card-hover">
            Search
          </button>
        </form>
        {candidates.length > 0 && (
          <ul className="space-y-1">
            {candidates.map((c) => (
              <li key={`${c.lat},${c.lng}`}>
                <button
                  onClick={() => saveLocation(c)}
                  className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-white/5"
                >
                  {[c.name, c.admin1, c.country].filter(Boolean).join(", ")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {locations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs">
                {l.name}
                <button onClick={() => removeLocation(l.id)} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {locations.length === 0 ? (
        <p className="text-muted-foreground">Add a location above to see a forecast.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={locationId ?? ""}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Runnable hours:</span>
              <select
                value={startHour}
                onChange={(e) => updateHours(parseInt(e.target.value, 10), endHour)}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1"
              >
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
              <span>to</span>
              <select
                value={endHour}
                onChange={(e) => updateHours(startHour, parseInt(e.target.value, 10))}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1"
              >
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
          </div>

          {loading && <p className="text-muted-foreground">Loading forecast…</p>}
          {error && <p className="text-red-400">{error}</p>}

          <div className="space-y-5">
            {days.map((day) => (
              <div key={day.date}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="font-semibold">{day.date}</h3>
                  {day.bestWindow && (
                    <span className="text-sm text-primary">
                      Best: {fmtHour(day.bestWindow.hour)} · {Math.round(day.bestWindow.dew_point_f)}°F dew · {day.bestWindow.comfort.label}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {day.hours
                    .filter((h) => h.hour >= startHour && h.hour <= endHour)
                    .map((h) => (
                      <div
                        key={h.time}
                        title={`${fmtHour(h.hour)} — dew ${Math.round(h.dew_point_f)}°F, ${h.comfort.label}: ${h.comfort.advice}`}
                        className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg text-[10px] text-white ${h.comfort.color}`}
                      >
                        <span>{fmtHour(h.hour)}</span>
                        <span>{Math.round(h.dew_point_f)}°</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add "Planner" to `src/components/sidebar.tsx`**

Add `CloudSun` to the lucide import (the import block already imports `Activity, BarChart3, LayoutDashboard, LogOut, Music, Settings`):

```tsx
  CloudSun,
```

Insert into `navItems` between Activities and Settings:

```tsx
  { href: "/planner", label: "Planner", icon: CloudSun },
```

- [ ] **Step 4: Add "Planner" to `src/components/bottom-nav.tsx`**

Add `CloudSun` to its lucide import (currently `Activity, LayoutDashboard, Settings`) and insert into `navItems` between Activities and Settings:

```tsx
  { href: "/planner", label: "Planner", icon: CloudSun },
```

- [ ] **Step 5: Build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; `/planner` listed; lint clean. If lint flags `react-hooks/set-state-in-effect`, keep the `async function load()` pattern already used here (setState lives in the async callback, not the effect body).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/planner" src/components/sidebar.tsx src/components/bottom-nav.tsx
git commit -m "feat(planner): add planner page and nav entry"
```

---

## Task 10: Activities page — comfort badge + enrich button

**Files:**
- Modify: `src/app/(auth)/activities/page.tsx`

- [ ] **Step 1: Add imports near the top of `src/app/(auth)/activities/page.tsx`**

Add `revalidatePath` is already imported. Add these imports after the existing imports:

```ts
import { CloudSun } from "lucide-react";
import { summarizeActivityComfort } from "@/lib/activities-comfort";
import { enrichActivitiesWeather } from "@/lib/weather/enrich";
import type { WeatherSample } from "@/lib/weather/types";
```

- [ ] **Step 2: Render the comfort badge per activity**

Inside the `activities.map((activity, i) => ...)` block, immediately before the `<ChevronRight ... />` element, add:

```tsx
              {(() => {
                const comfort = summarizeActivityComfort(
                  (activity.weather as unknown as WeatherSample[] | null) ?? null
                );
                return comfort ? (
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-semibold text-white ${comfort.color}`}>
                    {comfort.label}
                  </span>
                ) : (
                  <span className="shrink-0 text-[0.65rem] text-muted-foreground/40">—</span>
                );
              })()}
```

- [ ] **Step 3: Add an Enrich button next to the Sync button**

Replace the header's `<SyncButton />` line with both buttons wrapped:

```tsx
        <div className="flex items-center gap-2">
          <EnrichButton />
          <SyncButton />
        </div>
```

Then add this `EnrichButton` server-action component at the bottom of the file (next to the existing `SyncButton` function), mirroring the Sync button pattern:

```tsx
function EnrichButton() {
  async function enrichAction() {
    "use server";
    const session = await auth();
    if (!session?.user?.id) return;
    await enrichActivitiesWeather(session.user.id);
    revalidatePath("/activities");
  }

  return (
    <form action={enrichAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium card-surface card-hover"
      >
        <CloudSun className="size-3.5" />
        Enrich weather
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds; lint clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/activities/page.tsx"
git commit -m "feat(planner): show dew-point comfort badge and enrich action on activities"
```

---

## Task 11: Migrate DB + end-to-end verification (requires live DB + Strava)

**Prerequisite:** a working `.env` for musicflow-next (DATABASE_URL to its Postgres, NextAuth + Strava env) and a signed-in user with synced Strava activities.

- [ ] **Step 1: Create + apply the migration**

Run: `npx prisma migrate dev --name dew_point_planner`
Expected: a new migration under `prisma/migrations/`, applied to the DB; `saved_locations` table created and `Activity.weather` / `User.runStartHour` / `User.runEndHour` columns added.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: all tests pass (dewpoint-score, open-meteo, forecast, geocode, activities-comfort + existing suite).

- [ ] **Step 3: Browser smoke test**

Run: `npm run dev`, sign in, then:
- `/planner` → add a city (search → pick) → forecast grid renders, color-coded, with a best window per day; change runnable hours and confirm the grid re-filters and persists on reload.
- `/activities` → click **Enrich weather** → wait → runs show comfort badges (or "—" for runs without GPS).

- [ ] **Step 4: Commit the migration**

```bash
git add prisma/migrations
git commit -m "chore(planner): add dew-point planner migration"
```

---

## Self-Review Notes

- **Spec coverage:** SavedLocation + Activity.weather + User hours (T1); dew point in archive (T3); comfort scale (T2); forecast + best window (T4); geocoding (T5); activity comfort (T6); streams + per-km enrichment (T7); locations/forecast/preferences routes (T8); planner UI + nav (T9); activities badge + enrich trigger (T10); migration + e2e (T11). The spec's `/api/weather/enrich` route is intentionally implemented as a **server action** on the activities page instead (matches musicflow-next's existing Sync-button pattern; same behavior, fewer moving parts).
- **Type consistency:** `DewPointComfort`, `WeatherSample`, `ForecastHour`, `ForecastDay` defined in `src/lib/weather/types.ts` (T1) and imported by all later modules. `GeocodeResult` exported from `geocode.ts` and consumed by the route + client. `SavedLocation` is the Prisma model; the client uses a structurally-matching local type (string ids).
- **musicflow-next specifics honored:** colocated `*.test.ts`, explicit vitest imports, `auth()` route guard, Prisma access, server-action mutation, `(auth)` route group for the page, design-system classes for styling.
- **Out of scope (unchanged):** personalization, composite scoring, contiguous blocks, DB-cached forecasts, notifications, touching run-analyzer or the Flask app.
