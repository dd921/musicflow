"use client"

import { HeartPulse } from "lucide-react"
import type { StravaStreams } from "@/lib/strava"

const ZONES = [
  { label: "Z1", name: "Recovery",  minPct: 0,   maxPct: 0.60, color: "#3b82f6" },
  { label: "Z2", name: "Easy",      minPct: 0.60, maxPct: 0.70, color: "#14b8a6" },
  { label: "Z3", name: "Aerobic",   minPct: 0.70, maxPct: 0.80, color: "#22c55e" },
  { label: "Z4", name: "Threshold", minPct: 0.80, maxPct: 0.90, color: "#f97316" },
  { label: "Z5", name: "Max",       minPct: 0.90, maxPct: 1.01, color: "#ef4444" },
]

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export function HrZones({
  streams,
  maxHeartrate,
}: {
  streams: StravaStreams | null
  maxHeartrate: number | null
}) {
  const hrData = streams?.heartrate?.data
  const timeData = streams?.time?.data

  if (!hrData?.length || !maxHeartrate) return null

  // Accumulate dwell time per zone
  const zoneTimes = ZONES.map(() => 0)

  for (let i = 0; i < hrData.length; i++) {
    const dwell = i === 0 ? 0 : (timeData ? timeData[i] - timeData[i - 1] : 1)
    const pct = hrData[i] / maxHeartrate
    const zoneIdx = ZONES.findIndex((z) => pct >= z.minPct && pct < z.maxPct)
    if (zoneIdx >= 0) zoneTimes[zoneIdx] += dwell
  }

  const totalTime = zoneTimes.reduce((a, b) => a + b, 0)
  if (totalTime === 0) return null

  return (
    <div className="card-surface rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">Heart Rate Zones</h2>
      </div>

      {/* Stacked bar */}
      <div className="flex h-4 w-full rounded-full overflow-hidden gap-px">
        {ZONES.map((zone, i) => {
          const share = zoneTimes[i] / totalTime
          if (share === 0) return null
          return (
            <div
              key={zone.label}
              style={{ width: `${share * 100}%`, backgroundColor: zone.color }}
              title={`${zone.label} ${zone.name}: ${formatDuration(zoneTimes[i])}`}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        {ZONES.map((zone, i) => {
          if (zoneTimes[i] === 0) return null
          const minBpm = Math.round(maxHeartrate * zone.minPct)
          const maxBpm =
            zone.maxPct >= 1
              ? maxHeartrate
              : Math.round(maxHeartrate * zone.maxPct) - 1
          const bpmRange =
            zone.maxPct >= 1
              ? `≥${minBpm} bpm`
              : `${minBpm}–${maxBpm} bpm`
          const share = ((zoneTimes[i] / totalTime) * 100).toFixed(0)

          return (
            <div key={zone.label} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: zone.color }}
              />
              <span className="w-16 font-medium">
                {zone.label} · {zone.name}
              </span>
              <span className="text-muted-foreground w-28">{bpmRange}</span>
              <span className="tabular-nums text-muted-foreground w-12">
                {formatDuration(zoneTimes[i])}
              </span>
              <span className="tabular-nums text-muted-foreground">{share}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
