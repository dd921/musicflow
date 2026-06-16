import type { StravaStreams } from "@/lib/strava"
import { formatPace, type UnitSystem } from "@/lib/units"

export type SegmentStats = {
  avgHeartrate: number | null
  avgCadence: number | null
  avgPower: number | null
  // metres per second; format with paceFromSpeed() for a pace string
  avgSpeed: number | null
}

function avgOverWindow(
  time: number[],
  values: number[] | undefined,
  startSec: number,
  endSec: number,
  { dropZero = true }: { dropZero?: boolean } = {}
): number | null {
  if (!values || values.length === 0) return null
  let sum = 0
  let n = 0
  for (let i = 0; i < time.length; i++) {
    if (time[i] < startSec) continue
    if (time[i] > endSec) break
    const v = values[i]
    if (v == null || !Number.isFinite(v)) continue
    if (dropZero && v <= 0) continue
    sum += v
    n++
  }
  return n > 0 ? sum / n : null
}

// Average HR / cadence / power / speed over a [startSec, endSec] window of the
// activity. Samples are indexed by streams.time (seconds from start). Zero/blank
// samples (stops, sensor dropouts) are excluded so averages reflect active effort.
export function segmentStats(
  streams: StravaStreams,
  startSec: number,
  endSec: number
): SegmentStats {
  const time = streams.time?.data ?? []
  return {
    avgHeartrate: avgOverWindow(time, streams.heartrate?.data, startSec, endSec),
    avgCadence: avgOverWindow(time, streams.cadence?.data, startSec, endSec),
    avgPower: avgOverWindow(time, streams.watts?.data, startSec, endSec),
    avgSpeed: avgOverWindow(time, streams.velocity_smooth?.data, startSec, endSec),
  }
}

// Format an average speed (m/s) as a pace string ("7:42 /mi"). Reuses formatPace
// by treating the speed as distance-per-second.
export function paceFromSpeed(
  metersPerSec: number | null,
  units: UnitSystem
): string {
  if (metersPerSec == null || metersPerSec <= 0) return "—"
  return formatPace(1, metersPerSec, units)
}
