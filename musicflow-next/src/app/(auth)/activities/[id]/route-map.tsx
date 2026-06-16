"use client"

import { useState } from "react"
import { projectRoute, splitRouteByTracks, toSvgPath } from "@/lib/route-geometry"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"
import { useActivityView } from "./activity-view-context"

const NO_TRACK_COLOR = "rgba(255,255,255,0.25)"
const SVG_W = 800
const SVG_H = 450

// Linear interpolate between two hex colors by t in [0,1].
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r},${g},${bl})`
}

// Green → amber → red ramp. t=0 is fastest (green), t=1 is slowest (red).
function paceColor(t: number): string {
  if (t < 0.5) return lerpColor("#1DB954", "#f39c12", t * 2)
  return lerpColor("#f39c12", "#e74c3c", (t - 0.5) * 2)
}

type ColorMode = "song" | "pace"

export function RouteMap({
  latlng,
  time,
  tracks,
  velocity,
}: {
  latlng: [number, number][]
  time: number[]
  tracks: TrackSegment[]
  velocity?: number[]
}) {
  const [colorMode, setColorMode] = useState<ColorMode>("song")
  const { hoverSec } = useActivityView()

  if (latlng.length < 2) return null

  const { points } = projectRoute(latlng, SVG_W, SVG_H, 24)
  const runs = splitRouteByTracks(time, tracks)

  // --- Pace coloring ---
  // Build per-segment pace colors when in pace mode. We compute a "pace" value
  // for each run by averaging velocity_smooth over its index range, then
  // normalise across all runs so the ramp covers the observed spread.
  let paceColors: string[] | null = null
  if (colorMode === "pace" && velocity && velocity.length > 0) {
    const avgSpeeds = runs.map((run) => {
      const slice = velocity.slice(run.start, run.end + 1).filter((v) => v > 0)
      return slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0
    })
    const maxSpeed = Math.max(...avgSpeeds)
    const minSpeed = Math.min(...avgSpeeds.filter((v) => v > 0))
    const speedRange = maxSpeed - minSpeed || 1
    paceColors = avgSpeeds.map((spd) => {
      if (spd === 0) return NO_TRACK_COLOR
      // t=0 → fastest (green), t=1 → slowest (red)
      const t = 1 - (spd - minSpeed) / speedRange
      return paceColor(Math.max(0, Math.min(1, t)))
    })
  }

  // --- Hover marker ---
  let markerPoint: [number, number] | null = null
  if (hoverSec !== null && time.length > 0) {
    // Find the index in the time array closest to hoverSec
    let bestIdx = 0
    let bestDiff = Math.abs(time[0] - hoverSec)
    for (let i = 1; i < time.length; i++) {
      const diff = Math.abs(time[i] - hoverSec)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }
    if (bestIdx < points.length) {
      markerPoint = points[bestIdx]
    }
  }

  const showToggle = !!velocity && velocity.length > 0

  return (
    <div className="card-surface rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold tracking-tight">Route</h3>
        {showToggle && (
          <div className="flex gap-1 glass rounded-lg p-1">
            <button
              onClick={() => setColorMode("song")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                colorMode === "song"
                  ? "bg-white/15 text-white"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              By song
            </button>
            <button
              onClick={() => setColorMode("pace")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                colorMode === "pace"
                  ? "bg-white/15 text-white"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              By pace
            </button>
          </div>
        )}
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {runs.map((run, idx) => (
          <path
            key={run.start}
            d={toSvgPath(points.slice(run.start, run.end + 1))}
            fill="none"
            stroke={
              colorMode === "pace" && paceColors
                ? paceColors[idx]
                : run.trackIndex === null
                ? NO_TRACK_COLOR
                : TRACK_COLORS[run.trackIndex % TRACK_COLORS.length]
            }
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Start / end markers */}
        <circle cx={points[0][0]} cy={points[0][1]} r={5} fill="#1DB954" />
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r={5}
          fill="#FF6B35"
        />

        {/* Hover marker (Feature 6) */}
        {markerPoint && (
          <g>
            <circle
              cx={markerPoint[0]}
              cy={markerPoint[1]}
              r={10}
              fill="white"
              fillOpacity={0.15}
            >
              <animate
                attributeName="r"
                values="8;14;8"
                dur="1.2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="fill-opacity"
                values="0.2;0.05;0.2"
                dur="1.2s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={markerPoint[0]}
              cy={markerPoint[1]}
              r={5}
              fill="white"
              fillOpacity={0.9}
            />
          </g>
        )}
      </svg>
    </div>
  )
}
