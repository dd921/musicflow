"use client"

import * as Plotly from "plotly.js-basic-dist-min"
import createPlotlyComponent from "react-plotly.js/factory"
import type { Layout, PlotData } from "plotly.js"
import type { StravaStreams } from "@/lib/strava"

const Plot = createPlotlyComponent(Plotly)

const GRID_COLOR = "rgba(255, 255, 255, 0.06)"
const FONT_COLOR = "#a1a1aa"

export const PLOT_MARGIN = { l: 56, r: 16 }

type Metric = {
  key: keyof StravaStreams
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

const METRICS: Metric[] = [
  { key: "heartrate", label: "Heart Rate (bpm)", color: "#FF3366" },
  {
    key: "velocity_smooth",
    label: "Pace (min/km)",
    color: "#1DB954",
    // Pace blows up at near-zero speeds; blank those points instead
    transform: (values) =>
      movingAverage(values, 5).map((v) => (v > 0.5 ? 1000 / v / 60 : null)),
    reversed: true,
  },
  { key: "cadence", label: "Cadence", color: "#667eea" },
  { key: "watts", label: "Power (W)", color: "#f39c12" },
  { key: "altitude", label: "Elevation (m)", color: "#3498db" },
]

export default function ActivityPlot({ streams }: { streams: StravaStreams }) {
  const time = streams.time?.data
  if (!time || time.length === 0) return null

  const minutes = time.map((t) => t / 60)
  const available = METRICS.filter(
    (m) => m.key !== "time" && (streams[m.key]?.data?.length ?? 0) > 0
  )
  if (available.length === 0) return null

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
    xaxis: {
      title: { text: "Time (min)" },
      gridcolor: GRID_COLOR,
      zeroline: false,
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
