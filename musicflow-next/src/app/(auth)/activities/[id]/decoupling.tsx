"use client"

import { TrendingUp, Activity } from "lucide-react"
import type { StravaStreams } from "@/lib/strava"

type Band = "negative" | "excellent" | "moderate" | "high"

function getBand(pct: number): Band {
  if (pct < 0) return "negative"
  if (pct < 5) return "excellent"
  if (pct < 10) return "moderate"
  return "high"
}

const BAND_CONFIG: Record<
  Band,
  { color: string; interpretation: string; Icon: typeof TrendingUp }
> = {
  negative: {
    color: "text-emerald-400",
    interpretation:
      "Negative split — you got more efficient as you went.",
    Icon: TrendingUp,
  },
  excellent: {
    color: "text-emerald-400",
    interpretation:
      "Excellent aerobic durability — pace held steady relative to effort.",
    Icon: Activity,
  },
  moderate: {
    color: "text-amber-400",
    interpretation:
      "Moderate cardiac drift — normal for a hard or hot effort.",
    Icon: Activity,
  },
  high: {
    color: "text-red-400",
    interpretation:
      "High decoupling — fatigue, heat, or going out too fast.",
    Icon: TrendingUp,
  },
}

function avgRatio(
  velocity: number[],
  heartrate: number[],
  timeData: number[],
  startTime: number,
  endTime: number
): number | null {
  let sumSpeed = 0
  let sumHr = 0
  let count = 0

  for (let i = 0; i < timeData.length; i++) {
    const t = timeData[i]
    if (t < startTime || t > endTime) continue
    const v = velocity[i]
    const hr = heartrate[i]
    if (!v || !hr || v <= 0 || hr <= 0) continue
    sumSpeed += v
    sumHr += hr
    count++
  }

  if (count === 0) return null
  const avgSpeed = sumSpeed / count
  const avgHr = sumHr / count
  return avgSpeed / avgHr
}

export function Decoupling({ streams }: { streams: StravaStreams | null }) {
  const velocity = streams?.velocity_smooth?.data
  const heartrate = streams?.heartrate?.data
  const timeData = streams?.time?.data

  if (!velocity?.length || !heartrate?.length || !timeData?.length) return null
  if (velocity.length < 4 || heartrate.length < 4) return null

  const startTime = timeData[0]
  const endTime = timeData[timeData.length - 1]
  const midTime = (startTime + endTime) / 2

  const firstRatio = avgRatio(velocity, heartrate, timeData, startTime, midTime)
  const secondRatio = avgRatio(velocity, heartrate, timeData, midTime, endTime)

  if (firstRatio === null || secondRatio === null || firstRatio === 0) return null

  const decouplingPct = ((firstRatio - secondRatio) / firstRatio) * 100
  const band = getBand(decouplingPct)
  const { color, interpretation, Icon } = BAND_CONFIG[band]

  const sign = decouplingPct > 0 ? "+" : ""
  const display = `${sign}${decouplingPct.toFixed(1)}%`

  return (
    <div className="card-surface rounded-2xl p-6 space-y-3">
      <p className="eyebrow">Aerobic Decoupling</p>

      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 shrink-0 ${color}`} />
        <span className={`text-3xl font-bold tabular-nums ${color}`}>
          {display}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-snug">{interpretation}</p>
    </div>
  )
}
