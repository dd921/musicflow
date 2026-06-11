export type RouteRun = {
  trackIndex: number | null
  start: number
  end: number
}

// Equirectangular projection (lng scaled by cos of mean latitude), fitted and
// centered into a width x height box with north up.
export function projectRoute(
  coords: [number, number][],
  width: number,
  height: number,
  padding = 0
): { points: [number, number][] } {
  if (coords.length === 0) return { points: [] }

  const center: [number, number] = [width / 2, height / 2]
  if (coords.length === 1) return { points: [center] }

  const lats = coords.map((c) => c[0])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)

  const xs = coords.map((c) => c[1] * cosLat)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const dx = maxX - minX
  const dy = maxLat - minLat

  if (dx === 0 && dy === 0) {
    return { points: coords.map(() => center) }
  }

  const scales: number[] = []
  if (dx > 0) scales.push((width - 2 * padding) / dx)
  if (dy > 0) scales.push((height - 2 * padding) / dy)
  const scale = Math.min(...scales)

  const offsetX = (width - dx * scale) / 2
  const offsetY = (height - dy * scale) / 2

  return {
    points: coords.map(([lat], i) => [
      offsetX + (xs[i] - minX) * scale,
      offsetY + (maxLat - lat) * scale,
    ]),
  }
}

export function toSvgPath(points: [number, number][]): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${round1(x)},${round1(y)}`)
    .join(" ")
}

function round1(v: number): number {
  return Number(v.toFixed(1))
}

// Partitions stream indices [0, time.length) into contiguous runs by which
// track window each point falls in. Adjacent runs share their boundary index
// (run.end === next run.start) so rendered path segments connect.
export function splitRouteByTracks(
  time: number[],
  tracks: { startSec: number; endSec: number }[]
): RouteRun[] {
  if (time.length === 0) return []

  const labelOf = (t: number): number | null => {
    const i = tracks.findIndex((w) => t >= w.startSec && t <= w.endSec)
    return i === -1 ? null : i
  }

  const runs: RouteRun[] = []
  let runStart = 0
  let label = labelOf(time[0])

  for (let i = 1; i <= time.length; i++) {
    const next = i < time.length ? labelOf(time[i]) : undefined
    if (next === label) continue
    runs.push({
      trackIndex: label,
      start: runStart,
      end: i < time.length ? i : i - 1,
    })
    runStart = i
    label = next as number | null
  }

  return runs
}
