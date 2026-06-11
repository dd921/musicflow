import { decodePolyline } from "@/lib/polyline"
import { projectRoute, toSvgPath } from "@/lib/route-geometry"

export function RouteThumbnail({
  polyline,
  className,
}: {
  polyline: string
  className?: string
}) {
  const coords = decodePolyline(polyline)
  if (coords.length < 2) return null

  const { points } = projectRoute(coords, 100, 100, 8)

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d={toSvgPath(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
