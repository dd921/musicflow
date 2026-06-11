# Song-on-Workout Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MusicFlow's core feature — songs overlaid on workout charts — actually appear, correctly aligned, on the activity detail page.

**Architecture:** All work is in the Next.js app at `musicflow-next/`. We extract track-to-activity alignment into a pure, unit-tested library (`src/lib/track-segments.ts`), fix the Spotify `played_at` interpretation (it marks the END of playback, not the start), shade the Plotly metric chart with per-track colored bands (true overlay, matching the legacy Python app's design), explain empty states, and add a staleness-triggered Spotify sync so track data actually exists when the user views an activity.

**Tech Stack:** Next.js 16.2.2 (App Router, Server Components), React 19, TypeScript, Prisma 7 (driver adapter `@prisma/adapter-pg`, generated client at `src/generated/prisma`), Supabase Postgres, NextAuth v5 beta, Plotly via `react-plotly.js/factory` + `plotly.js-basic-dist-min`, Tailwind 4. Tests: Vitest (added in Task 1).

---

## ⚠️ Read this before writing any code

1. **Next.js version warning:** `musicflow-next/AGENTS.md` says this Next.js version has breaking changes vs. your training data. Before modifying any page/component, skim the relevant guide under `musicflow-next/node_modules/next/dist/docs/01-app/`. The existing code in this repo is known-good Next 16 style — match it.
2. **Working directory:** all commands below run from `/Users/dandeangelis/Dev/musicflow/musicflow-next` unless noted.
3. **The database in `.env.local` is the production Supabase instance** (there is only one environment). `prisma migrate dev` applies directly to it (via `DIRECT_URL`, see `prisma.config.ts`). Be careful with any data you insert; the verification task uses sentinel IDs and cleans up after itself.
4. **Code style:** TypeScript, no `any`, functional components, no unnecessary comments, files under 500 lines. No `Co-Authored-By` trailers on commits.
5. Per-task fast check is `npx tsc --noEmit` + `npm test`; run the full `npm run build` in the final task.

---

## Background: why the feature is "missing" (diagnosis, already verified)

The UI for this feature **already exists** (`src/app/(auth)/activities/[id]/` — stats, Plotly chart, a track-timeline band, a track list, a peak-HR callout). It has never rendered because of four compounding problems. Don't re-litigate these; they were verified against the production DB on 2026-06-11:

1. **Zero data overlap (the visible symptom).** The DB has 81 activities (latest started 2026-06-09 16:36 UTC) and exactly 50 tracks, whose `playedAt` range starts 2026-06-09 20:47 UTC — i.e., Spotify history begins *after* the newest activity ended. Every activity page therefore renders with `tracks = []` and the overlay/band/list silently disappear. Spotify's API only exposes the last 50 plays, so historical backfill is impossible; the fix is forward-looking sync reliability (Task 5) plus honest empty states (Task 4).
2. **`played_at` semantics bug.** Spotify's recently-played `played_at` is the time a track **finished** playing. Verified empirically from the 50 stored rows: the gap between consecutive `playedAt` values matches the duration of the *later* track (e.g., gap 233s / later-track duration 233s; gap 380s / 379s; ~20 consecutive confirmations). The current code (`page.tsx` line 93-109) treats `playedAt` as the start, so once data does overlap, every segment would render one full song-length too late, and the query window (`playedAt` between `start − 3h` and `end`) both admits tracks that ended hours before the workout and drops tracks that finished just after it.
3. **Not actually an overlay.** Tracks render only as a thin strip *below* the Plotly chart. The legacy Python app (`plotting.py`, `_add_track_shading`) shaded the metric subplots themselves — that is the feature the user wants. Also the strip scales x by `elapsedTime` while the Plotly x-axis autoranges to the stream's max time, so the two don't align horizontally.
4. **Sync cadence guarantees future gaps.** Vercel Hobby crons run once daily (02:00 UTC) and the Spotify endpoint returns at most the 50 most recent plays — a heavy listening day evicts workout tracks before the cron fires. Only mitigation today is the manual "Sync all" button on the dashboard.

## File structure (what changes)

| File | Action | Responsibility |
|---|---|---|
| `vitest.config.ts`, `package.json` | Create / modify | Test runner |
| `src/lib/track-segments.ts` | Create | Pure alignment logic: played_at→segments, query window, shared track colors |
| `src/lib/track-segments.test.ts` | Create | Unit tests for the above |
| `src/app/(auth)/activities/[id]/page.tsx` | Modify | Use new lib; staleness sync; empty-state reasons |
| `src/app/(auth)/activities/[id]/activity-chart.tsx` | Modify | Import shared types/colors; pass tracks+elapsedTime to plot |
| `src/app/(auth)/activities/[id]/activity-plot.tsx` | Modify | Per-track shading shapes; fixed x-range |
| `prisma/schema.prisma` + new migration | Modify | `Account.lastSyncedAt` |
| `src/lib/sync-spotify.ts` | Modify | Record `lastSyncedAt`; add `syncSpotifyIfStale` |

---

### Task 1: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
})
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Verify the runner works (zero tests is the expected state)**

Run: `npm test`
Expected: vitest runs and reports "No test files found" with a non-crash exit (it exits 1 with no tests — that's fine for now; Task 2 adds tests).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Pure track-alignment library (TDD)

**Files:**
- Create: `src/lib/track-segments.ts`
- Test: `src/lib/track-segments.test.ts`

Core domain knowledge encoded here:
- `playedAt` = when the track **finished** playing (Spotify semantics, verified empirically — see Background #2).
- Inferred start = `playedAt − durationMs`, clamped to the previous track's `playedAt` (handles tracks that were skipped partway: only the actually-listened tail is attributed).
- A track overlaps the activity iff `playedAt > activityStart` and inferred start `< activityEnd`.
- Query window for candidates: `playedAt` in `[activityStart, activityEnd + 60min]` (60 min ≈ a generous max track length, so a track still playing as the workout ends is captured).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/track-segments.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  computeTrackSegments,
  trackQueryWindow,
  type TrackPlay,
} from "./track-segments"

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0)
const ELAPSED = 1800 // 30-minute activity

function play(overrides: Partial<TrackPlay>): TrackPlay {
  return {
    id: "t1",
    name: "Song",
    artists: ["Artist"],
    album: "Album",
    albumArt: null,
    albumArtSmall: null,
    playedAt: new Date(T0),
    durationMs: 200_000,
    ...overrides,
  }
}

describe("computeTrackSegments", () => {
  it("maps playedAt (finish time) back to a start/end window", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 300_000) })],
      T0,
      ELAPSED
    )
    expect(segments).toHaveLength(1)
    expect(segments[0].startSec).toBe(100) // finished at 300s, 200s long
    expect(segments[0].endSec).toBe(300)
  })

  it("excludes a track that finished at or before activity start", () => {
    expect(computeTrackSegments([play({ playedAt: new Date(T0) })], T0, ELAPSED)).toEqual([])
  })

  it("excludes a track that started at or after activity end", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 2_000_000) })], // started exactly at 1800s
      T0,
      ELAPSED
    )
    expect(segments).toEqual([])
  })

  it("clamps a track straddling the activity start to 0", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 100_000) })],
      T0,
      ELAPSED
    )
    expect(segments[0].startSec).toBe(0)
    expect(segments[0].endSec).toBe(100)
  })

  it("clamps a track straddling the activity end to elapsedTime", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 1_900_000) })],
      T0,
      ELAPSED
    )
    expect(segments[0].startSec).toBe(1700)
    expect(segments[0].endSec).toBe(1800)
  })

  it("clamps a partially-skipped track's start to the previous track's finish", () => {
    const segments = computeTrackSegments(
      [
        play({ id: "a", playedAt: new Date(T0 + 300_000) }),
        // only ~60s of this 200s track was actually played before it "finished"
        play({ id: "b", playedAt: new Date(T0 + 360_000) }),
      ],
      T0,
      ELAPSED
    )
    expect(segments).toHaveLength(2)
    expect(segments[1].startSec).toBe(300)
    expect(segments[1].endSec).toBe(360)
  })

  it("carries track metadata through", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 300_000), name: "X", artists: ["Y", "Z"] })],
      T0,
      ELAPSED
    )
    expect(segments[0].name).toBe("X")
    expect(segments[0].artists).toEqual(["Y", "Z"])
  })
})

describe("trackQueryWindow", () => {
  it("spans activity start to activity end plus one hour", () => {
    const w = trackQueryWindow(T0, T0 + ELAPSED * 1000)
    expect(w.gte).toEqual(new Date(T0))
    expect(w.lte).toEqual(new Date(T0 + ELAPSED * 1000 + 3_600_000))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./track-segments`.

- [ ] **Step 3: Implement `src/lib/track-segments.ts`**

```ts
export const TRACK_COLORS = [
  "#FF6B35",
  "#1DB954",
  "#FF3366",
  "#667eea",
  "#f39c12",
  "#2ecc71",
  "#e74c3c",
  "#9b59b6",
  "#3498db",
  "#1abc9c",
  "#e67e22",
  "#16a085",
]

const MAX_TRACK_DURATION_MS = 60 * 60 * 1000

export type TrackPlay = {
  id: string
  name: string
  artists: string[]
  album: string
  albumArt: string | null
  albumArtSmall: string | null
  // Spotify's played_at marks when playback FINISHED (verified empirically:
  // gaps between consecutive played_at values match the later track's duration)
  playedAt: Date
  durationMs: number
}

export type TrackSegment = {
  id: string
  name: string
  artists: string[]
  album: string
  albumArt: string | null
  albumArtSmall: string | null
  startSec: number
  endSec: number
}

export function trackQueryWindow(activityStartMs: number, activityEndMs: number) {
  return {
    gte: new Date(activityStartMs),
    lte: new Date(activityEndMs + MAX_TRACK_DURATION_MS),
  }
}

// plays must be sorted by playedAt ascending
export function computeTrackSegments(
  plays: TrackPlay[],
  activityStartMs: number,
  elapsedSec: number
): TrackSegment[] {
  const activityEndMs = activityStartMs + elapsedSec * 1000
  const segments: TrackSegment[] = []
  let prevFinishMs = -Infinity

  for (const p of plays) {
    const finishMs = p.playedAt.getTime()
    // If the previous play finished inside this track's nominal window, this
    // track was started late (previous one skipped) — clamp to the real start
    const startMs = Math.max(finishMs - p.durationMs, prevFinishMs)
    prevFinishMs = finishMs

    if (finishMs <= activityStartMs || startMs >= activityEndMs) continue

    segments.push({
      id: p.id,
      name: p.name,
      artists: p.artists,
      album: p.album,
      albumArt: p.albumArt,
      albumArtSmall: p.albumArtSmall,
      startSec: Math.max(0, (startMs - activityStartMs) / 1000),
      endSec: Math.min(elapsedSec, (finishMs - activityStartMs) / 1000),
    })
  }
  return segments
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/track-segments.ts src/lib/track-segments.test.ts
git commit -m "feat: track-segment alignment with correct Spotify played_at (finish-time) semantics"
```

---

### Task 3: Rewire the activity detail page to the corrected alignment

**Files:**
- Modify: `src/app/(auth)/activities/[id]/page.tsx` (imports, lines 9 and 79–109; type import)
- Modify: `src/app/(auth)/activities/[id]/activity-chart.tsx` (use shared type/colors)

- [ ] **Step 1: Update `activity-chart.tsx` to use the shared type and colors**

Replace the local `TRACK_COLORS` array (lines 18–31) and the local `export type TrackSegment` block (lines 33–42) with one import at the top:

```ts
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"
```

Everything else in the file stays unchanged for now (Task 4 modifies it again).

- [ ] **Step 2: Update `page.tsx`**

Replace the import of `ActivityChart, type TrackSegment` and the matching logic. The full set of edits:

Imports — replace

```ts
import { ActivityChart, type TrackSegment } from "./activity-chart"
```

with

```ts
import {
  computeTrackSegments,
  trackQueryWindow,
  type TrackSegment,
} from "@/lib/track-segments"
import { ActivityChart } from "./activity-chart"
```

Delete the now-unused constant:

```ts
const MAX_TRACK_GAP_MS = 3 * 60 * 60 * 1000
```

Replace the candidate query + mapping (currently lines 79–109):

```ts
  const [streams, candidateTracks] = await Promise.all([
    getStreams(activity),
    prisma.track.findMany({
      where: { userId, playedAt: trackQueryWindow(startMs, endMs) },
      orderBy: { playedAt: "asc" },
    }),
  ])

  const tracks: TrackSegment[] = computeTrackSegments(
    candidateTracks.map((t) => ({
      id: t.id,
      name: t.name,
      artists: JSON.parse(t.artists) as string[],
      album: t.album,
      albumArt: t.albumArt,
      albumArtSmall: t.albumArtSmall,
      playedAt: t.playedAt,
      durationMs: t.durationMs,
    })),
    startMs,
    activity.elapsedTime
  )
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck, tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/activities/[id]/page.tsx" "src/app/(auth)/activities/[id]/activity-chart.tsx"
git commit -m "fix: align tracks to activities using played_at finish-time semantics"
```

---

### Task 4: True overlay — shade the metric chart per track

The legacy app shaded every metric subplot with the playing track's color (`plotting.py:_add_track_shading`). Recreate that with Plotly layout `shapes` (`yref: "paper"` spans all stacked subplots since they share one x-axis), and pin the x-axis range to the activity's elapsed time so the chart and the album-art band below it align exactly.

**Files:**
- Modify: `src/app/(auth)/activities/[id]/activity-plot.tsx`
- Modify: `src/app/(auth)/activities/[id]/activity-chart.tsx` (pass new props)

- [ ] **Step 1: Replace `activity-plot.tsx` with this full content**

```tsx
"use client"

import * as Plotly from "plotly.js-basic-dist-min"
import createPlotlyComponent from "react-plotly.js/factory"
import type { Layout, PlotData, Shape } from "plotly.js"
import type { StravaStreams } from "@/lib/strava"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"

const Plot = createPlotlyComponent(Plotly)

const GRID_COLOR = "rgba(255, 255, 255, 0.06)"
const FONT_COLOR = "#a1a1aa"

export const PLOT_MARGIN = { l: 56, r: 16 }

type Metric = {
  key: keyof StravaStreams
  label: string
  color: string
  transform?: (values: number[]) => (number | null)[]
  reversed?: boolean
}

function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((sum, v) => sum + v, 0) / slice.length
  })
}

const METRICS: Metric[] = [
  { key: "heartrate", label: "Heart Rate (bpm)", color: "#FF3366" },
  {
    key: "velocity_smooth",
    label: "Pace (min/km)",
    color: "#1DB954",
    // Pace blows up at near-zero speeds; blank those points instead
    transform: (values) =>
      movingAverage(values, 5).map((v) => (v > 0.5 ? 1000 / v / 60 : null)),
    reversed: true,
  },
  { key: "cadence", label: "Cadence", color: "#667eea" },
  { key: "watts", label: "Power (W)", color: "#f39c12" },
  { key: "altitude", label: "Elevation (m)", color: "#3498db" },
]

export default function ActivityPlot({
  streams,
  tracks,
  elapsedTime,
}: {
  streams: StravaStreams
  tracks: TrackSegment[]
  elapsedTime: number
}) {
  const time = streams.time?.data
  if (!time || time.length === 0) return null

  const minutes = time.map((t) => t / 60)
  const available = METRICS.filter(
    (m) => m.key !== "time" && (streams[m.key]?.data?.length ?? 0) > 0
  )
  if (available.length === 0) return null

  // Shade each subplot with the track playing at that moment, matching the
  // band below the chart (same color order)
  const shapes: Partial<Shape>[] = tracks.map((track, i) => ({
    type: "rect",
    xref: "x",
    yref: "paper",
    x0: track.startSec / 60,
    x1: track.endSec / 60,
    y0: 0,
    y1: 1,
    fillcolor: TRACK_COLORS[i % TRACK_COLORS.length],
    opacity: 0.14,
    line: { width: 0 },
    layer: "below",
  }))

  const gap = 0.08
  const slot = 1 / available.length
  const traces: Partial<PlotData>[] = []
  const layout: Partial<Layout> = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: FONT_COLOR, size: 11 },
    margin: { ...PLOT_MARGIN, t: 8, b: 36 },
    height: 140 * available.length + 44,
    showlegend: false,
    hovermode: "x unified",
    shapes,
    xaxis: {
      title: { text: "Time (min)" },
      gridcolor: GRID_COLOR,
      zeroline: false,
      range: [0, elapsedTime / 60],
    },
  }

  available.forEach((metric, i) => {
    const raw = streams[metric.key]!.data
    const y = metric.transform ? metric.transform(raw) : raw
    const axisId = i === 0 ? "y" : `y${i + 1}`

    traces.push({
      x: minutes,
      y,
      name: metric.label,
      type: "scatter",
      mode: "lines",
      line: { color: metric.color, width: 1.5 },
      yaxis: axisId,
      hovertemplate: "%{y:.1f}<extra>" + metric.label + "</extra>",
    })

    // Subplots stack top to bottom in metric order
    const domainTop = 1 - i * slot
    layout[i === 0 ? "yaxis" : (`yaxis${i + 1}` as "yaxis")] = {
      title: { text: metric.label, font: { size: 10 } },
      domain: [domainTop - slot + gap * slot, domainTop],
      gridcolor: GRID_COLOR,
      zeroline: false,
      autorange: metric.reversed ? "reversed" : true,
    }
  })

  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      className="w-full"
      useResizeHandler
      style={{ width: "100%" }}
    />
  )
}
```

- [ ] **Step 2: Pass the new props from `activity-chart.tsx`**

In `activity-chart.tsx`, change the plot invocation (currently `<ActivityPlot streams={streams!} />`) to:

```tsx
<ActivityPlot streams={streams!} tracks={tracks} elapsedTime={elapsedTime} />
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/activities/[id]/activity-plot.tsx" "src/app/(auth)/activities/[id]/activity-chart.tsx"
git commit -m "feat: shade workout chart with per-track overlay bands"
```

---

### Task 5: Honest empty states

When no tracks match, the page must say *why* — most of Dan's 81 activities predate his Spotify history and can never be matched (Spotify exposes only the last 50 plays).

**Files:**
- Modify: `src/app/(auth)/activities/[id]/page.tsx`

- [ ] **Step 1: Compute the reason in `page.tsx`**

After the `tracks` computation from Task 3, add:

```ts
  let noTracksReason: string | null = null
  if (tracks.length === 0) {
    const firstTrack = await prisma.track.findFirst({
      where: { userId },
      orderBy: { playedAt: "asc" },
      select: { playedAt: true },
    })
    if (!firstTrack) {
      noTracksReason =
        "No Spotify listening history synced yet. Connect Spotify in Settings, then press Sync on the dashboard."
    } else if (firstTrack.playedAt.getTime() > endMs) {
      const since = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(firstTrack.playedAt)
      noTracksReason = `This activity predates your Spotify history, which begins ${since}. Spotify only exposes recent plays, so older workouts can't be matched.`
    } else {
      noTracksReason = "No Spotify plays overlapped this workout."
    }
  }
```

- [ ] **Step 2: Render it under the chart**

Immediately after the `<ActivityChart ... />` element in the JSX, add:

```tsx
      {noTracksReason && (
        <div className="glass rounded-xl p-4">
          <p className="text-sm text-muted-foreground">🎵 {noTracksReason}</p>
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/activities/[id]/page.tsx"
git commit -m "feat: explain why no tracks matched an activity"
```

---

### Task 6: Staleness-triggered Spotify sync

Daily crons + a 50-play API window lose data. Sync opportunistically when the user views an activity, throttled via a new `Account.lastSyncedAt` column (updated even when a sync inserts nothing, which `max(Track.storedAt)` couldn't express).

**Files:**
- Modify: `prisma/schema.prisma` (Account model)
- Create: migration via `prisma migrate dev`
- Modify: `src/lib/sync-spotify.ts`
- Modify: `src/app/(auth)/activities/[id]/page.tsx`

- [ ] **Step 1: Add the column to `prisma/schema.prisma`**

In `model Account`, after the `scope String?` line, add:

```prisma
  lastSyncedAt      DateTime?
```

- [ ] **Step 2: Create and apply the migration (applies to the live Supabase DB via DIRECT_URL — this exact column add is safe and additive)**

```bash
npx prisma migrate dev --name add_account_last_synced_at
```

Expected: new folder under `prisma/migrations/` containing `ALTER TABLE "Account" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);`, client regenerated.

- [ ] **Step 3: Update `src/lib/sync-spotify.ts`** — record sync time and add the throttled entry point. Full new file content:

```ts
import { prisma } from "@/lib/prisma"
import { fetchRecentTracks } from "@/lib/spotify"
import { getValidToken } from "@/lib/tokens"

const SYNC_STALE_MS = 15 * 60 * 1000

export type SyncResult = {
  inserted: number
  skipped: number
  error?: string
}

export async function syncSpotifyTracks(userId: string): Promise<SyncResult> {
  const accessToken = await getValidToken(userId, "spotify")
  if (!accessToken) {
    return { inserted: 0, skipped: 0, error: "No valid Spotify token" }
  }

  const items = await fetchRecentTracks(accessToken)

  await prisma.account.update({
    where: { userId_provider: { userId, provider: "spotify" } },
    data: { lastSyncedAt: new Date() },
  })

  if (items.length === 0) return { inserted: 0, skipped: 0 }

  const records = items.map((item) => {
    const images = item.track.album.images.sort((a, b) => b.height - a.height)
    return {
      userId,
      spotifyTrackId: item.track.id,
      name: item.track.name,
      artists: JSON.stringify(item.track.artists.map((a) => a.name)),
      album: item.track.album.name,
      albumArt: images[0]?.url ?? null,
      albumArtSmall: images.find((i) => i.height <= 64)?.url ?? images[images.length - 1]?.url ?? null,
      durationMs: item.track.duration_ms,
      playedAt: new Date(item.played_at),
    }
  })

  const result = await prisma.track.createMany({
    data: records,
    skipDuplicates: true,
  })

  return {
    inserted: result.count,
    skipped: records.length - result.count,
  }
}

export async function syncSpotifyIfStale(userId: string): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { userId_provider: { userId, provider: "spotify" } },
    select: { lastSyncedAt: true },
  })
  if (!account) return
  if (
    account.lastSyncedAt &&
    Date.now() - account.lastSyncedAt.getTime() < SYNC_STALE_MS
  ) {
    return
  }
  try {
    await syncSpotifyTracks(userId)
  } catch {
    // best effort — the page still renders with already-stored tracks
  }
}
```

- [ ] **Step 4: Call it from the activity detail page**

In `page.tsx`, add the import:

```ts
import { syncSpotifyIfStale } from "@/lib/sync-spotify"
```

and insert this line directly after `const endMs = ...` and before the `Promise.all` that loads streams/tracks:

```ts
  await syncSpotifyIfStale(userId)
```

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/sync-spotify.ts "src/app/(auth)/activities/[id]/page.tsx"
git commit -m "feat: throttled on-demand Spotify sync when viewing an activity"
```

---

### Task 7: Final verification (build + visual)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: build succeeds (this also runs `prisma generate`).

- [ ] **Step 2: Seed sentinel tracks overlapping the latest activity** (the `.env.local` DB is production — these rows use a `test-overlay-` ID prefix and are deleted in Step 5)

```bash
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=\"?([^\"\n]+)\"?/)[1];
const { Client } = require('pg');
const c = new Client({ connectionString: url });
c.connect().then(async () => {
  const a = (await c.query('select id, \"userId\", \"startDate\", \"elapsedTime\" from \"Activity\" order by \"startDate\" desc limit 1')).rows[0];
  const start = new Date(a.startDate).getTime();
  const mk = (n, finishOffsetSec, durSec) => c.query(
    'insert into \"Track\" (id, \"userId\", \"spotifyTrackId\", name, artists, album, \"durationMs\", \"playedAt\") values (\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8) on conflict do nothing',
    ['test-overlay-' + n, a.userId, 'test-overlay-' + n, 'Test Song ' + n, JSON.stringify(['Test Artist']), 'Test Album', durSec * 1000, new Date(start + finishOffsetSec * 1000)]
  );
  await mk(1, 240, 240);  // plays 0:00–4:00
  await mk(2, 480, 240);  // plays 4:00–8:00
  await mk(3, 720, 240);  // plays 8:00–12:00
  console.log('Seeded 3 sentinel tracks for activity', a.id, '— open /activities/' + a.id);
  await c.end();
});
"
```

Expected output: `Seeded 3 sentinel tracks for activity <id> — open /activities/<id>`.

- [ ] **Step 3: Run the dev server and view**

```bash
npm run dev
```

Open `http://localhost:3000/activities/<id from step 2>` (requires being signed in — ask Dan to verify in his browser if no session is available). Confirm:
- the metric chart shows three colored shaded bands over the heart-rate/pace subplots,
- the album-art band below is horizontally aligned with the shading (same left edge, same widths),
- the band colors match the shading colors,
- the Tracks list shows the three test songs.

- [ ] **Step 4: Verify an old activity shows the explanatory empty state**

Open any activity from before June 2026. Expected text: "This activity predates your Spotify history, which begins June 9, 2026 …"

- [ ] **Step 5: Clean up sentinel rows (required)**

```bash
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=\"?([^\"\n]+)\"?/)[1];
const { Client } = require('pg');
const c = new Client({ connectionString: url });
c.connect().then(async () => {
  const r = await c.query('delete from \"Track\" where \"spotifyTrackId\" like \\'test-overlay-%\\'');
  console.log('Deleted', r.rowCount, 'sentinel tracks');
  await c.end();
});
"
```

Expected: `Deleted 3 sentinel tracks`.

- [ ] **Step 6: Push (Vercel auto-deploys main)**

```bash
git push origin main
```

Note: the `lastSyncedAt` migration was already applied to the shared database in Task 6, so the deploy needs no extra migration step.

---

## Out of scope (deliberately)

- Backfilling tracks for the 81 historical activities — impossible; Spotify's API exposes only the last 50 plays.
- Increasing cron frequency — requires a Vercel plan upgrade or an external pinger; the staleness sync in Task 6 covers the practical case (data is freshest exactly when an activity is viewed).
- Track names inside the Plotly hover tooltip — the band below the chart already shows full track details on hover.
