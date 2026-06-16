"use client"

import { HeartPulse, Music } from "lucide-react"
import { type StravaStreams } from "@/lib/strava"
import { type TrackSegment, TRACK_COLORS } from "@/lib/track-segments"
import { type UnitSystem, METERS_PER_MILE } from "@/lib/units"

type Split = {
  index: number
  splitSeconds: number
  avgHr: number | null
  track: TrackSegment | null
  trackIndex: number
  isPartial: boolean
  distanceMeters: number
}

function formatPaceSplit(splitSeconds: number, splitDistanceMeters: number, units: UnitSystem): string {
  const secPerUnit = splitSeconds / (splitDistanceMeters / (units === "metric" ? 1000 : METERS_PER_MILE))
  const minutes = Math.floor(secPerUnit / 60)
  const seconds = Math.round(secPerUnit % 60)
  const suffix = units === "metric" ? "/km" : "/mi"
  return `${minutes}:${String(seconds).padStart(2, "0")} ${suffix}`
}

function computeSplits(
  streams: StravaStreams,
  tracks: TrackSegment[],
  units: UnitSystem
): Split[] | null {
  const velocity = streams.velocity_smooth?.data
  const time = streams.time?.data
  if (!velocity || !time || velocity.length < 2 || time.length < 2) return null

  const splitDistanceMeters = units === "metric" ? 1000 : METERS_PER_MILE
  const minPartialDistance = splitDistanceMeters * 0.1

  // Integrate velocity to get cumulative distance at each sample
  const cumDist: number[] = new Array(time.length).fill(0)
  for (let i = 1; i < time.length; i++) {
    cumDist[i] = cumDist[i - 1] + velocity[i] * (time[i] - time[i - 1])
  }

  const totalDistance = cumDist[cumDist.length - 1]
  if (totalDistance < splitDistanceMeters) return null

  const hr = streams.heartrate?.data

  const splits: Split[] = []
  let splitStartIdx = 0
  let splitBoundary = splitDistanceMeters

  for (let i = 1; i < time.length; i++) {
    if (cumDist[i] >= splitBoundary) {
      const splitIndex = splits.length + 1
      const startSec = time[splitStartIdx]
      const endSec = time[i]
      const midSec = (startSec + endSec) / 2
      const splitSeconds = endSec - startSec

      // Avg HR over this split window (drop zeros)
      let hrSum = 0
      let hrCount = 0
      if (hr) {
        for (let j = splitStartIdx; j <= i; j++) {
          if (hr[j] > 0) {
            hrSum += hr[j]
            hrCount++
          }
        }
      }
      const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null

      // Track at midpoint
      const trackIndex = tracks.findIndex((t) => midSec >= t.startSec && midSec <= t.endSec)
      const track = trackIndex >= 0 ? tracks[trackIndex] : null

      splits.push({
        index: splitIndex,
        splitSeconds,
        avgHr,
        track,
        trackIndex: trackIndex >= 0 ? trackIndex : 0,
        isPartial: false,
        distanceMeters: splitDistanceMeters,
      })

      splitStartIdx = i
      splitBoundary += splitDistanceMeters
    }
  }

  // Final partial split
  const remainderDist = totalDistance - (splits.length * splitDistanceMeters)
  if (remainderDist >= minPartialDistance) {
    const startSec = time[splitStartIdx]
    const endSec = time[time.length - 1]
    const midSec = (startSec + endSec) / 2
    const splitSeconds = endSec - startSec

    let hrSum = 0
    let hrCount = 0
    if (hr) {
      for (let j = splitStartIdx; j < time.length; j++) {
        if (hr[j] > 0) {
          hrSum += hr[j]
          hrCount++
        }
      }
    }
    const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null

    const trackIndex = tracks.findIndex((t) => midSec >= t.startSec && midSec <= t.endSec)
    const track = trackIndex >= 0 ? tracks[trackIndex] : null

    splits.push({
      index: splits.length + 1,
      splitSeconds,
      avgHr,
      track,
      trackIndex: trackIndex >= 0 ? trackIndex : 0,
      isPartial: true,
      distanceMeters: remainderDist,
    })
  }

  return splits.length > 0 ? splits : null
}

function formatPartialDistance(meters: number, units: UnitSystem): string {
  if (units === "metric") {
    return `${Math.round(meters)} m`
  }
  return `${(meters / METERS_PER_MILE).toFixed(2)} mi`
}

export function Splits({
  streams,
  tracks,
  units,
}: {
  streams: StravaStreams | null
  tracks: TrackSegment[]
  units: UnitSystem
}) {
  if (!streams) return null

  const splits = computeSplits(streams, tracks, units)
  if (!splits) return null

  // Find fastest split for pace bar scaling (lower pace seconds = faster)
  const fastestPaceSec = Math.min(...splits.map((s) => s.splitSeconds / s.distanceMeters))

  return (
    <div className="card-surface rounded-2xl p-6">
      <h3 className="text-lg font-semibold tracking-tight mb-4">Splits</h3>
      <div className="space-y-2">
        {splits.map((split) => {
          const paceSecPerMeter = split.splitSeconds / split.distanceMeters
          const barWidth = Math.round((fastestPaceSec / paceSecPerMeter) * 100)
          const trackColor =
            split.track ? TRACK_COLORS[split.trackIndex % TRACK_COLORS.length] : undefined

          return (
            <div
              key={split.index}
              className="relative flex items-center gap-3 py-2 pl-3 pr-2 rounded-xl overflow-hidden"
            >
              {/* Track color left border */}
              <span
                className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
                style={{
                  backgroundColor: trackColor ?? "transparent",
                }}
              />

              {/* Split number */}
              <span className="font-mono text-xs text-muted-foreground w-5 shrink-0 tabular-nums">
                {split.index}
              </span>

              {/* Pace bar + pace text */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${barWidth}%`,
                      background: "linear-gradient(90deg, #1DB954 0%, #667eea 100%)",
                    }}
                  />
                </div>
                {split.isPartial && (
                  <span className="text-[0.6rem] text-muted-foreground">
                    {formatPartialDistance(split.distanceMeters, units)}
                  </span>
                )}
              </div>

              {/* Pace */}
              <span className="font-mono text-xs tabular-nums shrink-0 w-16 text-right">
                {formatPaceSplit(split.splitSeconds, split.distanceMeters, units)}
              </span>

              {/* HR */}
              {split.avgHr !== null ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 w-14">
                  <HeartPulse className="size-3 text-chart-3 shrink-0" />
                  <span className="tabular-nums">{split.avgHr}</span>
                </span>
              ) : (
                <span className="w-14 shrink-0" />
              )}

              {/* Track */}
              {split.track ? (
                <div className="flex items-center gap-1.5 shrink-0 max-w-[120px] sm:max-w-[180px]">
                  {split.track.albumArtSmall ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={split.track.albumArtSmall}
                      alt=""
                      className="h-6 w-6 rounded object-cover shrink-0"
                    />
                  ) : (
                    <span className="h-6 w-6 rounded bg-white/5 flex items-center justify-center shrink-0">
                      <Music className="size-3 text-muted-foreground" />
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {split.track.name}
                  </span>
                </div>
              ) : (
                <span className="w-[120px] sm:w-[180px] shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
