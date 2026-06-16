import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, HeartPulse, Music } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getValidToken } from "@/lib/tokens"
import { fetchActivityStreams, type StravaStreams } from "@/lib/strava"
import {
  computeTrackSegments,
  trackQueryWindow,
  untrackedSeconds,
  type TrackSegment,
} from "@/lib/track-segments"
import { syncSpotifyIfStale } from "@/lib/sync-spotify"
import {
  formatDistance,
  formatElevation,
  formatPace,
  type UnitSystem,
} from "@/lib/units"
import { encodePolyline } from "@/lib/polyline"
import { SportIcon } from "@/components/sport-icon"
import { ActivityChart } from "./activity-chart"
import { RouteMap } from "./route-map"
import { ActivityViewProvider } from "./activity-view-context"
import { Soundtrack } from "./soundtrack"
import { HrZones } from "./hr-zones"
import { Decoupling } from "./decoupling"
import { Splits } from "./splits"
import { TempoSync, type TempoTrack } from "./tempo-sync"
import { ShareCard } from "./share-card"

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

const ACTIVITY_VERBS: Record<string, string> = {
  Run: "ran",
  Ride: "rode",
  Walk: "walked",
  Hike: "hiked",
  Swim: "swam",
}

async function getStreams(activity: {
  id: string
  userId: string
  stravaId: bigint
  streams: unknown
  summaryPolyline: string | null
}): Promise<StravaStreams | null> {
  // Cached streams from before the map feature lack latlng; refetch those once.
  // Stored streams always carry a latlng key (empty for GPS-less activities)
  // so the refetch doesn't repeat.
  const cached = activity.streams as StravaStreams | null
  if (cached?.latlng) return cached

  const accessToken = await getValidToken(activity.userId, "strava")
  if (!accessToken) return cached

  try {
    const streams = await fetchActivityStreams(accessToken, activity.stravaId)
    streams.latlng ??= { data: [] }

    const latlng = streams.latlng.data
    const summaryPolyline =
      !activity.summaryPolyline && latlng.length >= 2
        ? encodePolyline(latlng)
        : activity.summaryPolyline

    await prisma.activity.update({
      where: { id: activity.id },
      data: { streams, summaryPolyline },
    })
    return streams
  } catch {
    return cached
  }
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user!.id!

  const [activity, user] = await Promise.all([
    prisma.activity.findFirst({ where: { id, userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { units: true } }),
  ])
  if (!activity) notFound()
  const units = (user?.units ?? "metric") as UnitSystem

  const startMs = activity.startDate.getTime()
  const endMs = startMs + activity.elapsedTime * 1000

  await syncSpotifyIfStale(userId)

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

  // Track segments drop the audio-features columns; re-join tempo by id for the
  // Cadence × Tempo view.
  const tempoById = new Map(candidateTracks.map((t) => [t.id, t.tempo]))
  const tempoTracks: TempoTrack[] = tracks.map((t) => ({
    id: t.id,
    name: t.name,
    artists: t.artists,
    albumArtSmall: t.albumArtSmall,
    startSec: t.startSec,
    endSec: t.endSec,
    tempo: tempoById.get(t.id) ?? null,
  }))

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

  const verb = ACTIVITY_VERBS[activity.type] ?? "logged"
  const narrative =
    activity.distance > 0
      ? `You ${verb} ${formatDistance(activity.distance, units)} in ${formatDuration(activity.movingTime)}` +
        (tracks.length > 0 ? ` to ${tracks.length} song${tracks.length === 1 ? "" : "s"}.` : ".")
      : tracks.length > 0
        ? `You listened to ${tracks.length} song${tracks.length === 1 ? "" : "s"} during this activity.`
        : null

  const peak = peakHeartrateCallout(streams, tracks, activity.maxHeartrate)

  // Spotify's recently-played history only logs music tracks (no podcasts) and
  // skips anything played under ~30s, so partial coverage is expected. Flag it
  // when a meaningful slice of the workout has no matched track.
  const uncovered = untrackedSeconds(tracks, activity.elapsedTime)
  const coverageNote =
    tracks.length > 0 && uncovered >= 120
      ? `About ${Math.round(uncovered / 60)} min of this workout isn't shown below. Spotify's history only records music plays longer than ~30 seconds, so podcasts and quick skips don't appear.`
      : null

  const stats = [
    activity.distance > 0 && {
      label: "Distance",
      value: formatDistance(activity.distance, units),
    },
    { label: "Moving Time", value: formatDuration(activity.movingTime) },
    activity.distance > 0 && {
      label: "Pace",
      value: formatPace(activity.movingTime, activity.distance, units),
    },
    activity.averageHeartrate && {
      label: "Avg HR",
      value: `${Math.round(activity.averageHeartrate)} bpm`,
    },
    activity.maxHeartrate && {
      label: "Max HR",
      value: `${Math.round(activity.maxHeartrate)} bpm`,
    },
    activity.totalElevation != null &&
      activity.totalElevation > 0 && {
        label: "Elevation",
        value: formatElevation(activity.totalElevation, units),
      },
    activity.calories && { label: "Calories", value: `${Math.round(activity.calories)}` },
  ].filter((s): s is { label: string; value: string } => Boolean(s))

  return (
    <div className="space-y-6">
      <div className="rise-in">
        <Link
          href="/activities"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Activities
        </Link>
        <div className="flex items-center gap-4 mt-3">
          <SportIcon type={activity.type} className="size-12" />
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{activity.name}</h2>
            <p className="text-muted-foreground mt-0.5">
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(activity.startDate)}{" "}
              · {activity.type}
            </p>
          </div>
        </div>
      </div>

      <div
        className="card-surface rounded-2xl p-6 space-y-5 rise-in"
        style={{ animationDelay: "80ms" }}
      >
        {narrative && <p className="text-lg">{narrative}</p>}
        {peak && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <HeartPulse className="size-4 text-chart-3 shrink-0" />
            {peak}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-xl font-semibold tabular-nums tracking-tight">
                {stat.value}
              </p>
              <p className="eyebrow mt-0.5 !text-[0.625rem]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="flex justify-end rise-in"
        style={{ animationDelay: "100ms" }}
      >
        <ShareCard
          title={activity.name}
          dateLabel={new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }).format(activity.startDate)}
          sportType={activity.type}
          stats={stats}
          tracks={tracks.map((t) => ({
            id: t.id,
            name: t.name,
            artists: t.artists,
            albumArtSmall: t.albumArtSmall,
          }))}
          units={units}
        />
      </div>

      <ActivityViewProvider>
        {streams?.latlng && streams.latlng.data.length >= 2 && (
          <div className="rise-in" style={{ animationDelay: "120ms" }}>
            <RouteMap
              latlng={streams.latlng.data}
              time={streams.time?.data ?? []}
              tracks={tracks}
              velocity={streams.velocity_smooth?.data}
            />
          </div>
        )}

        <div className="rise-in mt-6" style={{ animationDelay: "160ms" }}>
          <ActivityChart
            streams={streams}
            tracks={tracks}
            elapsedTime={activity.elapsedTime}
            units={units}
          />
        </div>
      </ActivityViewProvider>

      <div className="rise-in" style={{ animationDelay: "180ms" }}>
        <TempoSync tracks={tempoTracks} streams={streams} />
      </div>

      <div
        className="grid gap-6 sm:grid-cols-2 rise-in"
        style={{ animationDelay: "200ms" }}
      >
        <HrZones streams={streams} maxHeartrate={activity.maxHeartrate} />
        <Decoupling streams={streams} />
      </div>

      <div className="rise-in" style={{ animationDelay: "220ms" }}>
        <Splits streams={streams} tracks={tracks} units={units} />
      </div>

      {noTracksReason && (
        <div
          className="card-surface rounded-2xl p-4 flex items-center gap-3 rise-in"
          style={{ animationDelay: "240ms" }}
        >
          <Music className="size-4 text-accent shrink-0" />
          <p className="text-sm text-muted-foreground">{noTracksReason}</p>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="rise-in" style={{ animationDelay: "240ms" }}>
          <Soundtrack
            tracks={tracks}
            streams={streams}
            units={units}
            coverageNote={coverageNote}
          />
        </div>
      )}
    </div>
  )
}

function peakHeartrateCallout(
  streams: StravaStreams | null,
  tracks: TrackSegment[],
  maxHeartrate: number | null
): string | null {
  const hr = streams?.heartrate?.data
  const time = streams?.time?.data
  if (!hr || !time || hr.length === 0 || tracks.length === 0) return null

  let peakIndex = 0
  for (let i = 1; i < hr.length; i++) {
    if (hr[i] > hr[peakIndex]) peakIndex = i
  }

  const peakSec = time[peakIndex] ?? 0
  const track = tracks.find((t) => peakSec >= t.startSec && peakSec <= t.endSec)
  if (!track) return null

  const peakBpm = Math.round(maxHeartrate ?? hr[peakIndex])
  return `Heart rate peaked at ${peakBpm} bpm during “${track.name}” by ${track.artists.join(", ")}.`
}
