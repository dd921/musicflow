"use client"

import "leaflet/dist/leaflet.css"
import { useEffect, useMemo } from "react"
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet"
import { latLngBounds, type LatLngExpression } from "leaflet"
import { splitRouteByTracks } from "@/lib/route-geometry"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"
import { useActivityView } from "./activity-view-context"

const NO_TRACK_COLOR = "rgba(255,255,255,0.4)"

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

// Green → amber → red ramp. t=0 fastest (green), t=1 slowest (red).
function paceColor(t: number): string {
  if (t < 0.5) return lerpColor("#1DB954", "#f39c12", t * 2)
  return lerpColor("#f39c12", "#e74c3c", (t - 0.5) * 2)
}

// Fits the map to the route once, and revalidates size (sticky/resize layouts
// can mount the map before its container has its final dimensions).
function FitBounds({ latlng }: { latlng: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (latlng.length < 2) return
    map.fitBounds(latLngBounds(latlng as LatLngExpression[]), { padding: [24, 24] })
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map, latlng])
  return null
}

export default function RouteLeaflet({
  latlng,
  time,
  tracks,
  velocity,
  colorMode,
}: {
  latlng: [number, number][]
  time: number[]
  tracks: TrackSegment[]
  velocity?: number[]
  colorMode: "song" | "pace"
}) {
  const { hoverSec } = useActivityView()

  const runs = useMemo(() => splitRouteByTracks(time, tracks), [time, tracks])

  const paceColors = useMemo(() => {
    if (colorMode !== "pace" || !velocity || velocity.length === 0) return null
    const avgSpeeds = runs.map((run) => {
      const slice = velocity.slice(run.start, run.end + 1).filter((v) => v > 0)
      return slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0
    })
    const positive = avgSpeeds.filter((v) => v > 0)
    const maxSpeed = Math.max(...positive)
    const minSpeed = Math.min(...positive)
    const range = maxSpeed - minSpeed || 1
    return avgSpeeds.map((spd) => {
      if (spd === 0) return NO_TRACK_COLOR
      const t = 1 - (spd - minSpeed) / range // fast → 0 (green), slow → 1 (red)
      return paceColor(Math.max(0, Math.min(1, t)))
    })
  }, [colorMode, velocity, runs])

  // Hover marker: nearest sample to the hovered time.
  const markerPos = useMemo<LatLngExpression | null>(() => {
    if (hoverSec == null || time.length === 0) return null
    let best = 0
    let bestDiff = Math.abs(time[0] - hoverSec)
    for (let i = 1; i < time.length; i++) {
      const d = Math.abs(time[i] - hoverSec)
      if (d < bestDiff) {
        bestDiff = d
        best = i
      }
    }
    return latlng[best] ?? null
  }, [hoverSec, time, latlng])

  const start = latlng[0] as LatLngExpression
  const end = latlng[latlng.length - 1] as LatLngExpression

  return (
    <div className="h-72 sm:h-96 lg:h-[480px] overflow-hidden rounded-xl">
      <MapContainer
        className="h-full w-full"
        style={{ background: "#0b0b12" }}
        // Initial view so layers can attach before FitBounds refines it; without
        // this Leaflet throws "Set map center and zoom first".
        center={start}
        zoom={13}
        scrollWheelZoom={false}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <FitBounds latlng={latlng} />

        {runs.map((run, idx) => (
          <Polyline
            key={run.start}
            positions={latlng.slice(run.start, run.end + 1) as LatLngExpression[]}
            pathOptions={{
              color:
                colorMode === "pace" && paceColors
                  ? paceColors[idx]
                  : run.trackIndex === null
                    ? NO_TRACK_COLOR
                    : TRACK_COLORS[run.trackIndex % TRACK_COLORS.length],
              weight: 4,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ))}

        <CircleMarker
          center={start}
          radius={6}
          pathOptions={{ color: "#0b0b12", weight: 2, fillColor: "#1DB954", fillOpacity: 1 }}
        />
        <CircleMarker
          center={end}
          radius={6}
          pathOptions={{ color: "#0b0b12", weight: 2, fillColor: "#FF6B35", fillOpacity: 1 }}
        />

        {markerPos && (
          <>
            <CircleMarker
              center={markerPos}
              radius={12}
              pathOptions={{ color: "white", weight: 0, fillColor: "white", fillOpacity: 0.18 }}
            />
            <CircleMarker
              center={markerPos}
              radius={5}
              pathOptions={{ color: "#0b0b12", weight: 2, fillColor: "white", fillOpacity: 0.95 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}
