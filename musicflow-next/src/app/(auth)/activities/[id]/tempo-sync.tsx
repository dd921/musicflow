import { Music, Activity, Zap } from "lucide-react"
import { TRACK_COLORS } from "@/lib/track-segments"
import type { StravaStreams } from "@/lib/strava"

export type TempoTrack = {
  id: string
  name: string
  artists: string[]
  albumArtSmall: string | null
  startSec: number
  endSec: number
  tempo: number | null
}

type SyncResult = {
  track: TempoTrack
  colorIndex: number
  avgCadenceSpm: number
  closestBpm: number
  trackBpm: number
  diffBpm: number
  inSync: boolean
}

const SYNC_THRESHOLD_BPM = 4

function formatMinSec(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

function avgCadenceInWindow(
  streams: StravaStreams,
  startSec: number,
  endSec: number
): number | null {
  const time = streams.time?.data
  const cad = streams.cadence?.data
  if (!time || !cad || time.length === 0) return null

  const samples: number[] = []
  for (let i = 0; i < time.length; i++) {
    const t = time[i]
    if (t === undefined || t < startSec) continue
    if (t > endSec) break
    const c = cad[i]
    if (c != null && c > 0) samples.push(c)
  }

  if (samples.length === 0) return null
  return samples.reduce((a, b) => a + b, 0) / samples.length
}

function computeSyncResults(
  tracks: TempoTrack[],
  streams: StravaStreams
): SyncResult[] {
  const results: SyncResult[] = []
  let colorIndex = 0

  for (const track of tracks) {
    if (track.tempo == null) {
      colorIndex++
      continue
    }

    const avgCad = avgCadenceInWindow(streams, track.startSec, track.endSec)
    if (avgCad == null) {
      colorIndex++
      continue
    }

    // Strava running cadence is per-leg; full step rate ≈ 2× cadence
    const singleLegSpm = avgCad
    const fullStepSpm = avgCad * 2

    const diffSingle = Math.abs(track.tempo - singleLegSpm)
    const diffDouble = Math.abs(track.tempo - fullStepSpm)

    const closestSpm = diffSingle <= diffDouble ? singleLegSpm : fullStepSpm
    const diff = Math.min(diffSingle, diffDouble)

    results.push({
      track,
      colorIndex,
      avgCadenceSpm: fullStepSpm, // display as full step rate
      closestBpm: Math.round(closestSpm),
      trackBpm: Math.round(track.tempo),
      diffBpm: diff,
      inSync: diff <= SYNC_THRESHOLD_BPM,
    })
    colorIndex++
  }

  return results
}

export function TempoSync({
  tracks,
  streams,
}: {
  tracks: TempoTrack[]
  streams: StravaStreams | null
}) {
  if (!streams?.cadence?.data?.length) return null
  const hasAnyTempo = tracks.some((t) => t.tempo != null)
  if (!hasAnyTempo) return null

  const totalDurationSec = tracks.reduce(
    (sum, t) => sum + (t.endSec - t.startSec),
    0
  )

  const syncResults = computeSyncResults(tracks, streams)
  const inSyncResults = syncResults.filter((r) => r.inSync)

  const inSyncSec = inSyncResults.reduce(
    (sum, r) => sum + (r.track.endSec - r.track.startSec),
    0
  )

  const pctInSync =
    totalDurationSec > 0
      ? Math.round((inSyncSec / totalDurationSec) * 100)
      : 0

  return (
    <div className="card-surface rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
          <Zap className="size-4 text-accent shrink-0" />
          Cadence × Tempo
        </h3>
        <p className="text-sm text-muted-foreground">
          Where your stride locked to the beat
        </p>
      </div>

      {/* Headline stat */}
      {inSyncSec > 0 && (
        <div className="glass rounded-xl px-4 py-3 inline-flex items-center gap-3">
          <Activity className="size-4 text-accent shrink-0" />
          <div>
            <span className="text-xl font-bold tabular-nums text-accent">
              {formatMinSec(inSyncSec)}
            </span>
            <span className="text-sm text-muted-foreground ml-2">
              in sync ({pctInSync}% of music time)
            </span>
          </div>
        </div>
      )}

      {/* Timeline strip */}
      <div className="space-y-2">
        <p className="eyebrow text-muted-foreground">Timeline</p>
        <div className="flex h-7 rounded-lg overflow-hidden gap-px bg-white/5">
          {tracks.map((track, i) => {
            const trackDuration = track.endSec - track.startSec
            const widthPct =
              totalDurationSec > 0
                ? (trackDuration / totalDurationSec) * 100
                : 0
            const result = syncResults.find((r) => r.track.id === track.id)
            const color = TRACK_COLORS[i % TRACK_COLORS.length]
            const hasTempo = track.tempo != null
            const isInSync = result?.inSync ?? false

            return (
              <div
                key={track.id}
                title={`${track.name}${hasTempo ? (isInSync ? " · In sync" : " · Out of sync") : " · No tempo data"}`}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: color,
                  opacity: !hasTempo ? 0.2 : isInSync ? 1 : 0.35,
                  boxShadow:
                    isInSync
                      ? `0 0 8px 2px ${color}99`
                      : undefined,
                  transition: "opacity 0.2s",
                  minWidth: widthPct > 0 ? "2px" : undefined,
                }}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-accent opacity-90" />
            In sync
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-white/20" />
            Off beat
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-white/10" />
            No data
          </span>
        </div>
      </div>

      {/* In-sync track list */}
      {inSyncResults.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow text-muted-foreground">Locked-in tracks</p>
          <div className="space-y-2">
            {inSyncResults.map((r) => {
              const color = TRACK_COLORS[r.colorIndex % TRACK_COLORS.length]
              return (
                <div
                  key={r.track.id}
                  className="card-surface rounded-xl p-3 flex items-center gap-3 overflow-hidden relative"
                  style={{
                    borderLeft: `3px solid ${color}`,
                    boxShadow: `0 0 12px 0 ${color}22`,
                  }}
                >
                  {r.track.albumArtSmall ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.track.albumArtSmall}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Music className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{r.track.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.track.artists.join(", ")}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground mt-0.5">
                      {r.trackBpm} BPM ≈ {Math.round(r.avgCadenceSpm)} spm
                    </p>
                  </div>
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${color}22`,
                      color,
                      border: `1px solid ${color}55`,
                    }}
                  >
                    <Zap className="size-3" />
                    Sync
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {inSyncResults.length === 0 && syncResults.length > 0 && (
        <p className="text-sm text-muted-foreground">
          No tracks locked to your stride this run — closest was{" "}
          {syncResults.sort((a, b) => a.diffBpm - b.diffBpm)[0]?.track.name}
          {" "}(
          {Math.round(syncResults.sort((a, b) => a.diffBpm - b.diffBpm)[0]?.diffBpm ?? 0)}{" "}
          BPM off).
        </p>
      )}
    </div>
  )
}
