"use client"

import * as Plotly from "plotly.js-basic-dist-min"
import createPlotlyComponent from "react-plotly.js/factory"
import type { Layout, PlotData, Shape } from "plotly.js"
import type { StravaStreams } from "@/lib/strava"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"
import { METERS_PER_MILE, metersToFeet, type UnitSystem } from "@/lib/units"
import { useActivityView } from "./activity-view-context"

const Plot = createPlotlyComponent(Plotly)

const GRID_COLOR = "rgba(255, 255, 255, 0.06)"
const FONT_COLOR = "#a1a1aa"

export const PLOT_MARGIN = { l: 56, r: 16 }

type Metric = {
  key: Exclude<keyof StravaStreams, "latlng">
  label: string
  color: string
  transform?: (values: number[]) => (number | null)[]
  reversed?: boolean
}

// Centered moving average so smoothing doesn't lag the signal. A window of 1 (or
// less) is a no-op, leaving the raw stream untouched.
function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(values.length, i + half + 1)
    let sum = 0
    for (let j = start; j < end; j++) sum += values[j]
    return sum / (end - start)
  })
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// Crop the axis to the bulk of the data (ignoring dropout spikes) with a little
// padding, so trends are visible instead of being flattened against a 0 floor.
function croppedRange(values: (number | null)[]): [number, number] | undefined {
  const valid = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)
  if (valid.length < 2) return undefined
  const lo = percentile(valid, 0.02)
  const hi = percentile(valid, 0.98)
  if (hi <= lo) return undefined
  const pad = (hi - lo) * 0.1
  return [lo - pad, hi + pad]
}

function getMetrics(units: UnitSystem): Metric[] {
  const paceMeters = units === "metric" ? 1000 : METERS_PER_MILE
  return [
    { key: "heartrate", label: "Heart Rate (bpm)", color: "#FF3366" },
    {
      key: "velocity_smooth",
      label: units === "metric" ? "Pace (min/km)" : "Pace (min/mi)",
      color: "#1DB954",
      // Pace blows up at near-zero speeds; blank those points instead
      transform: (values) =>
        values.map((v) => (v > 0.5 ? paceMeters / v / 60 : null)),
      reversed: true,
    },
    { key: "cadence", label: "Cadence", color: "#667eea" },
    { key: "watts", label: "Power (W)", color: "#f39c12" },
    {
      key: "altitude",
      label: units === "metric" ? "Elevation (m)" : "Elevation (ft)",
      color: "#3498db",
      transform:
        units === "metric" ? undefined : (values) => values.map(metersToFeet),
    },
  ]
}

export default function ActivityPlot({
  streams,
  tracks,
  elapsedTime,
  units,
  xRange,
  smoothingSec = 0,
}: {
  streams: StravaStreams
  tracks: TrackSegment[]
  elapsedTime: number
  units: UnitSystem
  xRange?: [number, number]
  smoothingSec?: number
}) {
  const { setHoverSec } = useActivityView()

  const time = streams.time?.data
  if (!time || time.length === 0) return null

  const minutes = time.map((t) => t / 60)

  // Streams aren't always 1 Hz, so convert the requested smoothing window from
  // seconds into samples using the actual average spacing of the time stream.
  const sampleSec =
    time.length > 1 && time[time.length - 1] > time[0]
      ? (time[time.length - 1] - time[0]) / (time.length - 1)
      : 1
  const smoothingWindow = Math.max(1, Math.round(smoothingSec / sampleSec))
  const available = getMetrics(units).filter(
    (m) => m.key !== "time" && (streams[m.key]?.data?.length ?? 0) > 0
  )
  if (available.length === 0) return null

  // Shade each subplot with the track playing at that moment, matching the
  // band below the chart (same color order)
  const shapes: Partial<Shape>[] = tracks.map((track, i) => ({
    type: "rect",
    xref: "x",
    yref: "paper",
    x0: track.startSec / 60,
    x1: track.endSec / 60,
    y0: 0,
    y1: 1,
    fillcolor: TRACK_COLORS[i % TRACK_COLORS.length],
    opacity: 0.14,
    line: { width: 0 },
    layer: "below",
  }))

  const gap = 0.08
  const slot = 1 / available.length
  const traces: Partial<PlotData>[] = []
  const activeRange: [number, number] = xRange ?? [0, elapsedTime / 60]
  const layout: Partial<Layout> = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: FONT_COLOR, size: 11 },
    margin: { ...PLOT_MARGIN, t: 8, b: 36 },
    height: 140 * available.length + 44,
    showlegend: false,
    hovermode: "x unified",
    shapes,
    xaxis: {
      title: { text: "Time (min)" },
      gridcolor: GRID_COLOR,
      zeroline: false,
      range: activeRange,
    },
  }

  available.forEach((metric, i) => {
    const raw = movingAverage(streams[metric.key]!.data, smoothingWindow)
    const y = metric.transform ? metric.transform(raw) : raw
    const axisId = i === 0 ? "y" : `y${i + 1}`

    traces.push({
      x: minutes,
      y,
      name: metric.label,
      type: "scatter",
      mode: "lines",
      line: { color: metric.color, width: 1.5 },
      yaxis: axisId,
      hovertemplate: "%{y:.1f}<extra>" + metric.label + "</extra>",
    })

    // Subplots stack top to bottom in metric order
    const domainTop = 1 - i * slot
    const cropped = croppedRange(y)
    const range = cropped && metric.reversed ? [cropped[1], cropped[0]] : cropped
    layout[i === 0 ? "yaxis" : (`yaxis${i + 1}` as "yaxis")] = {
      title: { text: metric.label, font: { size: 10 } },
      domain: [domainTop - slot + gap * slot, domainTop],
      gridcolor: GRID_COLOR,
      zeroline: false,
      ...(range
        ? { range }
        : { autorange: metric.reversed ? "reversed" : true }),
    }
  })

  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      className="w-full"
      useResizeHandler
      style={{ width: "100%" }}
      onHover={(event) => {
        const point = event.points[0]
        if (point?.x != null) {
          // x axis is in minutes; convert to seconds for the shared context
          setHoverSec((point.x as number) * 60)
        }
      }}
      onUnhover={() => setHoverSec(null)}
    />
  )
}
