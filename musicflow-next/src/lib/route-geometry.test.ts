import { describe, expect, it } from "vitest"
import { projectRoute, splitRouteByTracks, toSvgPath } from "./route-geometry"

describe("projectRoute", () => {
  // 1°-lat x 2°-lng box centered on the equator (cos(meanLat) = 1)
  const BOX: [number, number][] = [
    [-0.5, 0],
    [0.5, 0],
    [0.5, 2],
    [-0.5, 2],
  ]

  it("fits the route in the box preserving aspect ratio, north up", () => {
    const { points } = projectRoute(BOX, 100, 100, 10)
    // lng extent 2 fills the padded width (scale 40); lat extent 1 is
    // centered vertically (30..70); north (lat 0.5) maps to smaller y
    expect(points).toEqual([
      [10, 70],
      [10, 30],
      [90, 30],
      [90, 70],
    ])
  })

  it("scales longitude by cos(mean latitude)", () => {
    // at lat 60, cos = 0.5, so a 2°-lng extent projects like 1° and the
    // route becomes a square filling the padded box
    const coords: [number, number][] = [
      [59.5, 0],
      [60.5, 0],
      [60.5, 2],
      [59.5, 2],
    ]
    const { points } = projectRoute(coords, 100, 100, 10)
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 0)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(80, 5)
  })

  it("centers a single point in the box", () => {
    expect(projectRoute([[38.5, -120.2]], 100, 50, 10).points).toEqual([[50, 25]])
  })

  it("centers all points when geographic extent is zero", () => {
    const { points } = projectRoute(
      [
        [38.5, -120.2],
        [38.5, -120.2],
      ],
      200,
      100,
      10
    )
    expect(points).toEqual([
      [100, 50],
      [100, 50],
    ])
  })

  it("returns no points for empty input", () => {
    expect(projectRoute([], 100, 100).points).toEqual([])
  })
})

describe("toSvgPath", () => {
  it("builds an M/L path with coordinates rounded to 1 decimal", () => {
    expect(
      toSvgPath([
        [10, 70.04],
        [10.55, 30],
        [3.14159, 29.999],
      ])
    ).toBe("M 10,70 L 10.6,30 L 3.1,30")
  })

  it("returns an empty string for no points", () => {
    expect(toSvgPath([])).toBe("")
  })
})

describe("splitRouteByTracks", () => {
  const TIME = [0, 10, 20, 30, 40, 50, 60]

  it("partitions indices into track and null runs with shared boundaries", () => {
    const runs = splitRouteByTracks(TIME, [
      { startSec: 0, endSec: 25 },
      { startSec: 25, endSec: 45 },
    ])
    expect(runs).toEqual([
      { trackIndex: 0, start: 0, end: 3 },
      { trackIndex: 1, start: 3, end: 5 },
      { trackIndex: null, start: 5, end: 6 },
    ])
  })

  it("returns a single null run when there are no tracks", () => {
    expect(splitRouteByTracks(TIME, [])).toEqual([
      { trackIndex: null, start: 0, end: 6 },
    ])
  })

  it("produces no null runs when tracks cover the whole stream", () => {
    const runs = splitRouteByTracks(TIME, [{ startSec: 0, endSec: 60 }])
    expect(runs).toEqual([{ trackIndex: 0, start: 0, end: 6 }])
  })

  it("inserts a null run between non-adjacent track windows", () => {
    const runs = splitRouteByTracks(TIME, [
      { startSec: 0, endSec: 15 },
      { startSec: 45, endSec: 60 },
    ])
    expect(runs).toEqual([
      { trackIndex: 0, start: 0, end: 2 },
      { trackIndex: null, start: 2, end: 5 },
      { trackIndex: 1, start: 5, end: 6 },
    ])
  })

  it("returns no runs for an empty time stream", () => {
    expect(splitRouteByTracks([], [{ startSec: 0, endSec: 10 }])).toEqual([])
  })
})
