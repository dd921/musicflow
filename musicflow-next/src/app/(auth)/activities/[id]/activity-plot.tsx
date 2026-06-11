"use client"

import * as Plotly from "plotly.js-basic-dist-min"
import createPlotlyComponent from "react-plotly.js/factory"
import type { Layout, PlotData, Shape } from "plotly.js"
import type { StravaStreams } from "@/lib/strava"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"
import { METERS_PER_MILE, metersToFeet, type UnitSystem } from "@/lib/units"

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

function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((sum, v) => sum + v, 0) / slice.length
  })
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
        movingAverage(values, 5).map((v) => (v > 0.5 ? paceMeters / v / 60 : null)),
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
}: {
  streams: StravaStreams
  tracks: TrackSegment[]
  elapsedTime: number
  units: UnitSystem
}) {
  const time = streams.time?.data
  if (!time || time.length === 0) return null

  const minutes = time.map((t) => t / 60)
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
      range: [0, elapsedTime / 60],
    },
  }

  available.forEach((metric, i) => {
    const raw = streams[metric.key]!.data
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
    layout[i === 0 ? "yaxis" : (`yaxis${i + 1}` as "yaxis")] = {
      title: { text: metric.label, font: { size: 10 } },
      domain: [domainTop - slot + gap * slot, domainTop],
      gridcolor: GRID_COLOR,
      zeroline: false,
      autorange: metric.reversed ? "reversed" : true,
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
    />
  )
}
