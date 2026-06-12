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
  TRACK_COLORS,
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

      {streams?.latlng && streams.latlng.data.length >= 2 && (
        <div className="rise-in" style={{ animationDelay: "120ms" }}>
          <RouteMap
            latlng={streams.latlng.data}
            time={streams.time?.data ?? []}
            tracks={tracks}
          />
        </div>
      )}

      <div className="rise-in" style={{ animationDelay: "160ms" }}>
        <ActivityChart
          streams={streams}
          tracks={tracks}
          elapsedTime={activity.elapsedTime}
          units={units}
        />
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
        <div className="space-y-3 rise-in" style={{ animationDelay: "240ms" }}>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold tracking-tight">Soundtrack</h3>
            {coverageNote && (
              <p className="inline-flex items-start gap-2 text-sm text-muted-foreground">
                <Music className="size-4 text-accent shrink-0 mt-0.5" />
                {coverageNote}
              </p>
            )}
          </div>
          <div className="space-y-2">
            {tracks.map((track, i) => (
              <div
                key={track.id}
                className="card-surface rounded-2xl p-3 flex items-center gap-3 overflow-hidden relative"
              >
                <span
                  className="absolute left-0 top-0 h-full w-1"
                  style={{ backgroundColor: TRACK_COLORS[i % TRACK_COLORS.length] }}
                />
                <span className="font-mono text-xs text-muted-foreground w-6 text-center shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {track.albumArtSmall ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.albumArtSmall}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <span className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Music className="size-4 text-muted-foreground" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{track.name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {track.artists.join(", ")} · {track.album}
                  </p>
                </div>
                <p className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatDuration(Math.round(track.startSec))}
                </p>
              </div>
            ))}
          </div>
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
