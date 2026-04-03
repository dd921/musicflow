# MusicFlow Redesign — Design Spec

**Date:** 2026-04-02
**Goal:** Rebuild MusicFlow as a modern Next.js app with a Spotify-inspired UI, new features, and improved reliability. Target audience: personal use with a few friends.

---

## 1. Overview

MusicFlow syncs Strava workout data with Spotify listening history to create interactive visualizations showing which songs were playing during different parts of your workouts. This redesign modernizes the stack (Python/Flask → Next.js/TypeScript), adds new features, and creates a polished, music-forward UI.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase PostgreSQL |
| ORM | Prisma |
| Auth | NextAuth.js (credentials provider + Strava/Spotify OAuth) |
| Charts | react-plotly.js |
| Share cards | @vercel/og (Satori) |
| Deployment | Vercel (free tier) |

### Key Architectural Decisions

- **Server Components by default.** Client Components only for interactive pieces (charts, toggles, sync buttons).
- **Server Actions** for mutations (sync tracks, create playlists, disconnect accounts).
- **Prisma** for type-safe database access with proper migrations (replacing manual SQL).
- **No SQLite option.** Supabase PostgreSQL only — simplifies the codebase.
- **No Docker.** Vercel handles deployment; local dev uses `next dev`.
- **All API keys stay server-side.** Strava/Spotify calls happen in Server Components and Server Actions.

---

## 3. Data Model (Prisma)

```prisma
model User {
  id            String     @id @default(cuid())
  username      String     @unique
  email         String?
  passwordHash  String
  createdAt     DateTime   @default(now())
  accounts      Account[]
  tracks        Track[]
  activities    Activity[]
}

model Account {
  id            String   @id @default(cuid())
  userId        String
  provider      String   // "strava" | "spotify"
  accessToken   String
  refreshToken  String?
  expiresAt     Int?
  scope         String?
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
}

model Track {
  id              String   @id @default(cuid())
  userId          String
  spotifyTrackId  String
  name            String
  artists         String   // JSON array string
  album           String
  albumArt        String?  // URL to 300px album cover
  albumArtSmall   String?  // URL to 64px album cover
  durationMs      Int
  tempo           Float?   // BPM from audio features
  energy          Float?   // 0.0-1.0 from audio features
  danceability    Float?   // 0.0-1.0 from audio features
  valence         Float?   // 0.0-1.0 ("happiness")
  playedAt        DateTime
  storedAt        DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, spotifyTrackId, playedAt])
  @@index([userId, playedAt])
  @@index([spotifyTrackId])
}

model Activity {
  id               String   @id @default(cuid())
  userId           String
  stravaId         BigInt   @unique
  name             String
  type             String   // "Run", "Ride", "Walk", etc.
  startDate        DateTime
  elapsedTime      Int      // seconds
  movingTime       Int      // seconds
  distance         Float    // meters
  averageHeartrate Float?
  maxHeartrate     Float?
  averageSpeed     Float?
  maxSpeed         Float?
  totalElevation   Float?
  calories         Float?
  streams          Json?    // cached Strava stream data
  fetchedAt        DateTime @default(now())
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, startDate])
}
```

### Changes from Current Schema

- **Activity caching**: Store Strava activity data + streams locally to avoid re-fetching.
- **Audio features on tracks**: Store tempo, energy, danceability, valence for correlation analysis.
- **Album art URLs**: Store both 300px and 64px variants per track.
- **Prisma manages migrations**: No more manual SQL or ad-hoc migration scripts.
- **Proper cascading deletes**: Deleting a user removes all their data.

---

## 4. Authentication

### Flow

1. **Registration/Login**: Username + password via NextAuth.js credentials provider.
2. **Strava Connect**: OAuth 2.0 flow → store tokens in `Account` table. Scope: `activity:read_all`.
3. **Spotify Connect**: OAuth 2.0 flow → store tokens in `Account` table. Scopes: `user-read-recently-played`, `user-read-playback-state`, `user-read-currently-playing`, `playlist-modify-public`.
4. **Token Refresh**: Server-side middleware checks token expiry before API calls. Auto-refreshes using stored refresh tokens. Updates `Account` record.

### Session Management

- NextAuth.js JWT strategy (no session table needed).
- Session contains `userId` and `username`.
- Protected routes check session server-side in layouts.

---

## 5. Pages & Routes

| Route | Type | Description |
|---|---|---|
| `/` | Public | Landing page with login/register |
| `/dashboard` | Protected | Recent activities with track previews, quick stats |
| `/activities` | Protected | Full activity list with search, filters, pagination |
| `/activity/[id]` | Protected | Activity detail: chart, stats summary, track list |
| `/tracks` | Protected | Track library: searchable/filterable history |
| `/insights` | Protected | Music-performance correlations and trends |
| `/settings` | Protected | Units, timezone, connected accounts, profile |
| `/api/og/[activityId]` | API (Edge) | Share card image generation |
| `/api/auth/[...nextauth]` | API | NextAuth.js auth routes |
| `/api/strava/callback` | API | Strava OAuth callback |
| `/api/spotify/callback` | API | Spotify OAuth callback |

### Layout Structure

```
app/
├── layout.tsx              # Root layout (fonts, theme provider)
├── page.tsx                # Landing/login (public)
├── (auth)/
│   ├── layout.tsx          # Auth layout (sidebar, nav, session check)
│   ├── dashboard/
│   │   └── page.tsx        # Dashboard
│   ├── activities/
│   │   └── page.tsx        # Activities list
│   ├── activity/
│   │   └── [id]/
│   │       └── page.tsx    # Activity detail
│   ├── tracks/
│   │   └── page.tsx        # Track library
│   ├── insights/
│   │   └── page.tsx        # Insights
│   └── settings/
│       └── page.tsx        # Settings
├── api/
│   ├── auth/[...nextauth]/
│   │   └── route.ts
│   ├── strava/
│   │   └── callback/route.ts
│   ├── spotify/
│   │   └── callback/route.ts
│   └── og/
│       └── [activityId]/route.tsx
```

---

## 6. Features

### 6.1 Dashboard

- Grid of recent activity cards (last 10-20).
- Each card shows: activity name, type icon, date, distance, duration, and a mosaic of album art from matched tracks as the card background.
- Quick stats bar: "X activities this week", "Y tracks synced", "Z hours of music".
- Sync status indicators for Strava and Spotify connections.
- "Sync Now" buttons that trigger Server Actions.

### 6.2 Activity Detail

**Stats Summary Card:**
- Key metrics: distance, duration, pace, elevation, calories.
- Narrative line: "You ran 5.2mi in 42:18 to 12 songs."
- Peak callout: "Heart rate peaked at 182 during 'Lose Yourself' by Eminem."
- Most energetic track: "Highest energy: 'Blinding Lights' (BPM: 171, Energy: 0.93)."

**Interactive Chart (react-plotly.js):**
- Multi-subplot layout: heart rate, pace, cadence, power, altitude (only show subplots for available data).
- Track timeline band below the chart: colored segments for each track, with 64px album art thumbnails.
- Track colors derived from a curated palette (not album art extraction — simpler and more consistent).
- Hover on track segment shows: track name, artist, album (300px art), duration, BPM.
- Smoothing controls: per-metric toggle with adjustable window (1-10).
- Unit toggle: metric/imperial.
- Timezone selector.

**Actions:**
- "Create Playlist" button → creates a Spotify playlist named "MusicFlow: {Activity Name} — {Date}".
- "Share" button → generates and downloads a share card PNG.

### 6.3 Track Library

- Paginated list/grid of all stored tracks.
- Search by track name or artist.
- Filter by date range.
- Sort by: date played, BPM, energy, artist.
- Each track shows: album art (300px), name, artist, album, BPM, energy, date played.
- Track count and date range summary at top.

### 6.4 Insights Page

Requires 10+ activities with matched tracks to show meaningful data. Shows a "keep syncing" message if not enough data.

**Correlation Cards:**
- "Your average pace by genre" (if genre data available, otherwise by energy level).
- "High-energy tracks (>0.8) → average pace: X:XX/mi vs low-energy → Y:YY/mi."
- "Your top 10 workout artists" ranked by frequency.
- "Fastest activity music" — which tracks were playing during your PR activities.
- "BPM sweet spot" — what tempo range correlates with your best performance.

**Charts:**
- Bar chart: pace by track energy bucket (low/medium/high).
- Scatter plot: track BPM vs. running cadence.
- Top artists leaderboard.

### 6.5 Playlist Generation

- Available on activity detail page.
- Server Action calls Spotify API to create playlist.
- Playlist name: "MusicFlow: {Activity Name} — {MMM DD, YYYY}".
- Adds all tracks that overlapped with the activity.
- Shows success toast with link to open playlist in Spotify.
- Scope: `playlist-modify-public` (already included in OAuth flow).

### 6.6 Share Cards

- Generated via `@vercel/og` (Satori) at `/api/og/[activityId]`.
- Size: 1200x630 (Open Graph standard).
- Layout:
  ```
  ┌──────────────────────────────────────────┐
  │  MusicFlow              {Activity Type}  │
  │                                          │
  │  {Activity Name}                         │
  │  {Date}                                  │
  │                                          │
  │  🏃 5.2 mi   ⏱ 42:15   ⚡ 8:07/mi       │
  │                                          │
  │  ♫ TOP TRACKS                            │
  │  [art] Track 1 — Artist                  │
  │  [art] Track 2 — Artist                  │
  │  [art] Track 3 — Artist                  │
  │                                          │
  │  musicflow.app                           │
  └──────────────────────────────────────────┘
  ```
- Background: gradient using the app's brand colors (green → orange).
- Album art: 64px thumbnails next to track names.
- Custom font: Inter (subset, Latin only, <200KB).
- Caching: `Cache-Control: public, max-age=86400` (1 day).
- Download button on activity detail page fetches the image and triggers browser download.

### 6.7 Historical Sync

**Strava:**
- On first connect: fetch last 6 months of activities (paginated, respecting 200 req/15min rate limit).
- Subsequent opens: fetch only activities newer than the most recent stored one.
- Stream data fetched on-demand when viewing activity detail (cached in `Activity.streams`).
- Rate limit tracking: read `X-RateLimit-Usage` headers, pause if approaching limits.

**Spotify:**
- On first connect and every app open: fetch 50 most recent tracks.
- Store all tracks with deduplication on `(userId, spotifyTrackId, playedAt)`.
- Batch-fetch audio features for any tracks missing tempo/energy (up to 100 per request).
- Manual "Sync Now" button for explicit refresh.

### 6.8 Settings Page

- **Profile**: Username, email (display only for now).
- **Connected Accounts**: Strava and Spotify connection status with connect/disconnect buttons.
- **Units**: Metric (km, m/s, m) or Imperial (mi, min/mi, ft). Stored in cookie for SSR.
- **Timezone**: Full timezone list via `Intl.supportedValuesOf('timeZone')`. Stored in cookie.
- **Account**: Delete account (with confirmation modal, cascading delete).

---

## 7. UI & Design Language

### Visual Identity

- **Vibe**: Spotify meets fitness dashboard. Dark, colorful, music-forward.
- **Primary gradient**: `#1DB954` (Spotify green) → `#FF6B35` (Strava orange).
- **Background**: Deep dark `#0A0A0A` with subtle noise texture.
- **Cards**: Frosted glass (`backdrop-blur-xl`, `bg-white/5` border, `bg-black/40` fill).
- **Track colors**: Curated 12-color palette for chart track segments (consistent, high contrast on dark bg).
- **Accent**: Album art colors bleed into gradient borders and glow effects on cards.

### Typography

- **Font**: Inter (via `next/font`).
- **Headings**: Bold, tight tracking.
- **Body**: Regular weight, comfortable line height.
- **Stats/numbers**: Tabular figures (`font-variant-numeric: tabular-nums`).

### Component Library (shadcn/ui)

Using shadcn/ui components, themed to match the dark/music aesthetic:
- Button, Card, Dialog, DropdownMenu, Input, Label, Select, Skeleton, Tabs, Toast, Toggle.
- Custom theme overrides for dark mode with the brand gradient as primary.

### Animations

- Page transitions: subtle fade (CSS transitions, not a library).
- Cards: slight scale on hover (`hover:scale-[1.02]`).
- Stats: count-up animation on first load (simple `useEffect` with `requestAnimationFrame`).
- Loading: Skeleton components from shadcn/ui while data fetches.

### Responsive Design

- **Desktop (>1024px)**: Sidebar nav (fixed, 240px) + main content area.
- **Tablet (768-1024px)**: Collapsible sidebar, slightly compressed layout.
- **Mobile (<768px)**: Bottom tab navigation, stacked layout, full-width cards, horizontally scrollable chart.

---

## 8. Data Processing (TypeScript Rewrites)

The Python data processing logic gets rewritten in TypeScript. The math is straightforward:

### Track-Activity Alignment

```
For each track in user's stored tracks:
  If track.playedAt falls within activity.startDate → activity.startDate + activity.elapsedTime:
    Match track to activity
    Calculate track's position in the activity timeline (offset from start)
```

### Smoothing

- Moving average with configurable window size (1-10).
- Applied client-side on the stream arrays before passing to Plotly.
- No library needed — simple sliding window over arrays.

### Unit Conversion

```typescript
// Pace: m/s → min/mi or min/km
// Distance: meters → miles or km
// Elevation: meters → feet or meters
// Speed: m/s → mph or km/h
```

### Correlation Analysis (Insights)

- Group activities by track energy buckets (low <0.4, medium 0.4-0.7, high >0.7).
- Calculate average pace per bucket.
- Track BPM vs. running cadence: simple scatter data.
- Top artists: count track occurrences grouped by artist.
- All computed server-side in the insights page Server Component.

---

## 9. Sync & Caching Strategy

### Data Freshness

| Data | Fetch Strategy | Cache |
|---|---|---|
| Activity list | On page load, fetch new since last stored | Prisma DB |
| Activity streams | On-demand (first view), then cached | `Activity.streams` JSON column |
| Spotify tracks | On app open + manual sync | Prisma DB, deduplicated |
| Audio features | Batch on new track storage | Stored on `Track` record |
| Share card image | On-demand, HTTP cached 24h | `Cache-Control` header |

### Rate Limit Handling

- **Strava**: Track usage via response headers. If >150/200 in 15-min window, queue remaining fetches with delay. Show user "syncing X of Y activities" progress.
- **Spotify**: Less restrictive (~180/min). Unlikely to hit with personal use. Retry on 429 with `Retry-After` header.

---

## 10. Security

- **Credentials**: All API keys and secrets in Vercel environment variables. Never in client bundles.
- **`.env` not committed**: Add to `.gitignore`. Current `.env` with exposed secrets must be rotated.
- **OAuth tokens**: Stored in Supabase PostgreSQL (encryption at rest provided by Supabase). Access tokens are short-lived and auto-refreshed.
- **CSRF**: NextAuth.js handles CSRF protection.
- **Input validation**: Validate all user inputs server-side (username, settings values).
- **SQL injection**: Prisma parameterizes all queries.

---

## 11. Migration Plan

### Data Migration

- Export existing tracks from current PostgreSQL/Supabase database.
- Write a one-time migration script to import into the new Prisma schema.
- Map old `user_id` (integer) to new `User.id` (cuid).
- Preserve all track history — this is the most valuable data.

### Credential Rotation

- Rotate Strava client secret (regenerate in Strava developer settings).
- Rotate Spotify client secret (regenerate in Spotify developer dashboard).
- Generate new `SECRET_KEY` / `NEXTAUTH_SECRET`.
- Update Supabase database password.
- Add `.env` to `.gitignore` before any new commits.

---

## 12. Out of Scope (for now)

- Social features (following other users, shared leaderboards).
- Native mobile app.
- Real-time sync (webhook-based — would need Strava subscription API).
- Genre-based analysis (Spotify doesn't provide genre per track, only per artist — complex to implement well).
- Map visualization of routes (would need Mapbox/Leaflet — separate feature).
- Email verification / password reset (overkill for personal use).
- Admin dashboard (not needed for personal use).
