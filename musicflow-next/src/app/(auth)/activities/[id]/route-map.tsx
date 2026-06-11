import { projectRoute, splitRouteByTracks, toSvgPath } from "@/lib/route-geometry"
import { TRACK_COLORS, type TrackSegment } from "@/lib/track-segments"

const NO_TRACK_COLOR = "rgba(255,255,255,0.25)"

export function RouteMap({
  latlng,
  time,
  tracks,
}: {
  latlng: [number, number][]
  time: number[]
  tracks: TrackSegment[]
}) {
  if (latlng.length < 2) return null

  const { points } = projectRoute(latlng, 800, 450, 24)
  const runs = splitRouteByTracks(time, tracks)
  const start = points[0]
  const end = points[points.length - 1]

  return (
    <div className="card-surface rounded-2xl p-4 sm:p-6">
      <h3 className="text-lg font-semibold tracking-tight mb-3">Route</h3>
      <svg
        viewBox="0 0 800 450"
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {runs.map((run) => (
          <path
            key={run.start}
            d={toSvgPath(points.slice(run.start, run.end + 1))}
            fill="none"
            stroke={
              run.trackIndex === null
                ? NO_TRACK_COLOR
                : TRACK_COLORS[run.trackIndex % TRACK_COLORS.length]
            }
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <circle cx={start[0]} cy={start[1]} r={5} fill="#1DB954" />
        <circle cx={end[0]} cy={end[1]} r={5} fill="#FF6B35" />
      </svg>
    </div>
  )
}
