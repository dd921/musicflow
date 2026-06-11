import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getValidToken } from "@/lib/tokens"
import { fetchActivityStreams, type StravaStreams } from "@/lib/strava"
import { ActivityChart, type TrackSegment } from "./activity-chart"

const MAX_TRACK_GAP_MS = 3 * 60 * 60 * 1000

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`
}

function formatPace(movingTime: number, meters: number): string {
  if (meters <= 0) return "—"
  const secPerKm = movingTime / (meters / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, "0")} /km`
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
}): Promise<StravaStreams | null> {
  if (activity.streams) return activity.streams as StravaStreams

  const accessToken = await getValidToken(activity.userId, "strava")
  if (!accessToken) return null

  try {
    const streams = await fetchActivityStreams(accessToken, activity.stravaId)
    await prisma.activity.update({
      where: { id: activity.id },
      data: { streams },
    })
    return streams
  } catch {
    return null
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

  const activity = await prisma.activity.findFirst({
    where: { id, userId },
  })
  if (!activity) notFound()

  const startMs = activity.startDate.getTime()
  const endMs = startMs + activity.elapsedTime * 1000

  const [streams, candidateTracks] = await Promise.all([
    getStreams(activity),
    prisma.track.findMany({
      where: {
        userId,
        playedAt: {
          gte: new Date(startMs - MAX_TRACK_GAP_MS),
          lte: new Date(endMs),
        },
      },
      orderBy: { playedAt: "asc" },
    }),
  ])

  // playedAt marks the start of playback; keep tracks whose play window
  // overlaps the activity window, clamped to it
  const tracks: TrackSegment[] = candidateTracks
    .filter((t) => t.playedAt.getTime() + t.durationMs > startMs)
    .map((t) => ({
      id: t.id,
      name: t.name,
      artists: JSON.parse(t.artists) as string[],
      album: t.album,
      albumArt: t.albumArt,
      albumArtSmall: t.albumArtSmall,
      startSec: Math.max(0, (t.playedAt.getTime() - startMs) / 1000),
      endSec: Math.min(
        activity.elapsedTime,
        (t.playedAt.getTime() + t.durationMs - startMs) / 1000
      ),
    }))

  const verb = ACTIVITY_VERBS[activity.type] ?? "logged"
  const narrative =
    activity.distance > 0
      ? `You ${verb} ${formatDistance(activity.distance)} in ${formatDuration(activity.movingTime)}` +
        (tracks.length > 0 ? ` to ${tracks.length} song${tracks.length === 1 ? "" : "s"}.` : ".")
      : tracks.length > 0
        ? `You listened to ${tracks.length} song${tracks.length === 1 ? "" : "s"} during this activity.`
        : null

  const peak = peakHeartrateCallout(streams, tracks, activity.maxHeartrate)

  const stats = [
    activity.distance > 0 && { label: "Distance", value: formatDistance(activity.distance) },
    { label: "Moving Time", value: formatDuration(activity.movingTime) },
    activity.distance > 0 && {
      label: "Pace",
      value: formatPace(activity.movingTime, activity.distance),
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
        value: `${Math.round(activity.totalElevation)} m`,
      },
    activity.calories && { label: "Calories", value: `${Math.round(activity.calories)}` },
  ].filter((s): s is { label: string; value: string } => Boolean(s))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/activities"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Activities
        </Link>
        <h2 className="text-3xl font-bold mt-2">{activity.name}</h2>
        <p className="text-muted-foreground mt-1">
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

      <div className="glass rounded-xl p-6 space-y-4">
        {narrative && <p className="text-lg">{narrative}</p>}
        {peak && <p className="text-sm text-muted-foreground">{peak}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-xl font-semibold tabular-nums">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <ActivityChart
        streams={streams}
        tracks={tracks}
        elapsedTime={activity.elapsedTime}
      />

      {tracks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Tracks</h3>
          <div className="space-y-2">
            {tracks.map((track) => (
              <div key={track.id} className="glass rounded-xl p-3 flex items-center gap-3">
                {track.albumArtSmall ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.albumArtSmall}
                    alt=""
                    className="h-10 w-10 rounded object-cover shrink-0"
                  />
                ) : (
                  <span className="h-10 w-10 rounded bg-white/5 flex items-center justify-center shrink-0">
                    🎵
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{track.name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {track.artists.join(", ")} · {track.album}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground tabular-nums shrink-0">
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
