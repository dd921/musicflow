"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import type { TrackSegment } from "@/lib/track-segments"

const RouteLeaflet = dynamic(() => import("./route-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="h-72 sm:h-96 lg:h-[480px] rounded-xl bg-white/5 animate-pulse" />
  ),
})

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

  if (latlng.length < 2) return null

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
      <RouteLeaflet
        latlng={latlng}
        time={time}
        tracks={tracks}
        velocity={velocity}
        colorMode={colorMode}
      />
    </div>
  )
}
