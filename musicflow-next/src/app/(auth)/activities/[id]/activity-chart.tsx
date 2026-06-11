"use client"

/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic"
import type { StravaStreams } from "@/lib/strava"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"

const ActivityPlot = dynamic(() => import("./activity-plot"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-lg bg-white/5 animate-pulse" />
  ),
})

// Plotly margins; the track band below must match so segments align with the plot area
const PLOT_MARGIN = { l: 56, r: 16 }

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

export function ActivityChart({
  streams,
  tracks,
  elapsedTime,
}: {
  streams: StravaStreams | null
  tracks: TrackSegment[]
  elapsedTime: number
}) {
  const hasStreams = (streams?.time?.data?.length ?? 0) > 0

  if (!hasStreams && tracks.length === 0) {
    return (
      <div className="card-surface rounded-2xl p-8 text-center">
        <p className="text-muted-foreground">
          No stream data or matched tracks for this activity yet.
        </p>
      </div>
    )
  }

  return (
    <div className="card-surface rounded-2xl p-4 sm:p-6 space-y-2">
      {hasStreams ? (
        <ActivityPlot streams={streams!} tracks={tracks} elapsedTime={elapsedTime} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No stream data available for this activity.
        </p>
      )}

      {tracks.length > 0 && (
        <div
          style={{
            marginLeft: PLOT_MARGIN.l,
            marginRight: PLOT_MARGIN.r,
          }}
        >
          <div className="relative h-12 rounded-md bg-white/5 overflow-visible">
            {tracks.map((track, i) => {
              const left = (track.startSec / elapsedTime) * 100
              const width = ((track.endSec - track.startSec) / elapsedTime) * 100
              return (
                <div
                  key={track.id}
                  className="group absolute top-0 h-full"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <div
                    className="h-full w-full rounded-sm border border-black/40 flex items-center overflow-hidden"
                    style={{ backgroundColor: TRACK_COLORS[i % TRACK_COLORS.length] }}
                  >
                    {track.albumArtSmall && (
                      <img
                        src={track.albumArtSmall}
                        alt=""
                        className="h-full w-auto aspect-square object-cover opacity-90"
                      />
                    )}
                  </div>

                  <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:flex z-20 glass rounded-lg p-3 gap-3 w-64 items-center">
                    {track.albumArt && (
                      <img
                        src={track.albumArt}
                        alt=""
                        className="h-12 w-12 rounded object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{track.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artists.join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatOffset(track.startSec)} – {formatOffset(track.endSec)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="eyebrow mt-2 !text-[0.625rem]">Track timeline</p>
        </div>
      )}
    </div>
  )
}
