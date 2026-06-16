import { Flame, Footprints, HeartPulse, Music } from "lucide-react"
import { segmentStats, paceFromSpeed } from "@/lib/activity-insights"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"
import type { StravaStreams } from "@/lib/strava"
import type { UnitSystem } from "@/lib/units"

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function findPowerSong(
  tracks: TrackSegment[],
  streams: StravaStreams
): { track: TrackSegment; index: number } | null {
  if (!streams.heartrate?.data || streams.heartrate.data.length === 0) return null

  let bestIndex = -1
  let bestHr = -Infinity
  let bestSpeed = -Infinity

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    const stats = segmentStats(streams, t.startSec, t.endSec)
    if (stats.avgHeartrate == null) continue
    if (
      stats.avgHeartrate > bestHr ||
      (stats.avgHeartrate === bestHr && (stats.avgSpeed ?? -Infinity) > bestSpeed)
    ) {
      bestHr = stats.avgHeartrate
      bestSpeed = stats.avgSpeed ?? -Infinity
      bestIndex = i
    }
  }

  if (bestIndex === -1) return null
  return { track: tracks[bestIndex], index: bestIndex }
}

export function Soundtrack({
  tracks,
  streams,
  units,
  coverageNote,
}: {
  tracks: TrackSegment[]
  streams: StravaStreams | null
  units: UnitSystem
  coverageNote: string | null
}) {
  const powerSong = streams ? findPowerSong(tracks, streams) : null

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight">Soundtrack</h3>
        {coverageNote && (
          <p className="inline-flex items-start gap-2 text-sm text-muted-foreground">
            <Music className="size-4 text-accent shrink-0 mt-0.5" />
            {coverageNote}
          </p>
        )}
      </div>

      {powerSong && streams && (
        <PowerSongCard track={powerSong.track} streams={streams} units={units} />
      )}

      <div className="space-y-2">
        {tracks.map((track, i) => {
          const stats = streams
            ? segmentStats(streams, track.startSec, track.endSec)
            : null
          const pace =
            stats?.avgSpeed != null ? paceFromSpeed(stats.avgSpeed, units) : null
          const hasStats =
            stats &&
            (stats.avgHeartrate != null || pace !== null || stats.avgCadence != null)

          return (
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
                {hasStats && (
                  <TrackStatLine
                    avgHeartrate={stats.avgHeartrate}
                    pace={pace}
                    avgCadence={stats.avgCadence}
                  />
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                {formatDuration(Math.round(track.startSec))}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrackStatLine({
  avgHeartrate,
  pace,
  avgCadence,
}: {
  avgHeartrate: number | null
  pace: string | null
  avgCadence: number | null
}) {
  const parts: React.ReactNode[] = []

  if (avgHeartrate != null) {
    parts.push(
      <span key="hr" className="inline-flex items-center gap-0.5">
        <HeartPulse className="size-3 shrink-0" />
        {Math.round(avgHeartrate)} bpm
      </span>
    )
  }
  if (pace != null && pace !== "—") {
    parts.push(
      <span key="pace" className="inline-flex items-center gap-0.5">
        <Footprints className="size-3 shrink-0" />
        {pace}
      </span>
    )
  }
  if (avgCadence != null) {
    parts.push(
      <span key="spm" className="inline-flex items-center gap-0.5">
        {Math.round(avgCadence)} spm
      </span>
    )
  }

  if (parts.length === 0) return null

  return (
    <p className="text-xs text-muted-foreground tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="opacity-40">·</span>}
          {part}
        </span>
      ))}
    </p>
  )
}

function PowerSongCard({
  track,
  streams,
  units,
}: {
  track: TrackSegment
  streams: StravaStreams
  units: UnitSystem
}) {
  const stats = segmentStats(streams, track.startSec, track.endSec)
  const pace =
    stats.avgSpeed != null ? paceFromSpeed(stats.avgSpeed, units) : null

  return (
    <div className="card-surface rounded-2xl p-4 flex items-center gap-4 overflow-hidden relative border border-accent/20 shadow-[0_0_16px_0_hsl(var(--accent)/0.08)]">
      <span className="absolute left-0 top-0 h-full w-1 bg-accent" />
      <div className="pl-1 shrink-0">
        {track.albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.albumArt}
            alt=""
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : (
          <span className="h-16 w-16 rounded-xl bg-white/5 flex items-center justify-center">
            <Music className="size-6 text-muted-foreground" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="eyebrow text-accent inline-flex items-center gap-1 mb-1">
          <Flame className="size-3 shrink-0" />
          Power Song
        </p>
        <p className="font-semibold truncate leading-tight">{track.name}</p>
        <p className="text-sm text-muted-foreground truncate">
          {track.artists.join(", ")}
        </p>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {stats.avgHeartrate != null && (
            <span className="text-xs tabular-nums text-muted-foreground inline-flex items-center gap-0.5">
              <HeartPulse className="size-3 text-chart-3 shrink-0" />
              {Math.round(stats.avgHeartrate)} bpm
            </span>
          )}
          {pace != null && pace !== "—" && (
            <span className="text-xs tabular-nums text-muted-foreground inline-flex items-center gap-0.5">
              <Footprints className="size-3 shrink-0" />
              {pace}
            </span>
          )}
          {stats.avgCadence != null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(stats.avgCadence)} spm
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
