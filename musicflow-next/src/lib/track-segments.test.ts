import { describe, expect, it } from "vitest"
import {
  computeTrackSegments,
  trackQueryWindow,
  type TrackPlay,
} from "./track-segments"

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0)
const ELAPSED = 1800 // 30-minute activity

function play(overrides: Partial<TrackPlay>): TrackPlay {
  return {
    id: "t1",
    name: "Song",
    artists: ["Artist"],
    album: "Album",
    albumArt: null,
    albumArtSmall: null,
    playedAt: new Date(T0),
    durationMs: 200_000,
    ...overrides,
  }
}

describe("computeTrackSegments", () => {
  it("maps playedAt (finish time) back to a start/end window", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 300_000) })],
      T0,
      ELAPSED
    )
    expect(segments).toHaveLength(1)
    expect(segments[0].startSec).toBe(100) // finished at 300s, 200s long
    expect(segments[0].endSec).toBe(300)
  })

  it("excludes a track that finished at or before activity start", () => {
    expect(computeTrackSegments([play({ playedAt: new Date(T0) })], T0, ELAPSED)).toEqual([])
  })

  it("excludes a track that started at or after activity end", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 2_000_000) })], // started exactly at 1800s
      T0,
      ELAPSED
    )
    expect(segments).toEqual([])
  })

  it("clamps a track straddling the activity start to 0", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 100_000) })],
      T0,
      ELAPSED
    )
    expect(segments[0].startSec).toBe(0)
    expect(segments[0].endSec).toBe(100)
  })

  it("clamps a track straddling the activity end to elapsedTime", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 1_900_000) })],
      T0,
      ELAPSED
    )
    expect(segments[0].startSec).toBe(1700)
    expect(segments[0].endSec).toBe(1800)
  })

  it("clamps a partially-skipped track's start to the previous track's finish", () => {
    const segments = computeTrackSegments(
      [
        play({ id: "a", playedAt: new Date(T0 + 300_000) }),
        // only ~60s of this 200s track was actually played before it "finished"
        play({ id: "b", playedAt: new Date(T0 + 360_000) }),
      ],
      T0,
      ELAPSED
    )
    expect(segments).toHaveLength(2)
    expect(segments[1].startSec).toBe(300)
    expect(segments[1].endSec).toBe(360)
  })

  it("carries track metadata through", () => {
    const segments = computeTrackSegments(
      [play({ playedAt: new Date(T0 + 300_000), name: "X", artists: ["Y", "Z"] })],
      T0,
      ELAPSED
    )
    expect(segments[0].name).toBe("X")
    expect(segments[0].artists).toEqual(["Y", "Z"])
  })
})

describe("trackQueryWindow", () => {
  it("spans activity start to activity end plus one hour", () => {
    const w = trackQueryWindow(T0, T0 + ELAPSED * 1000)
    expect(w.gte).toEqual(new Date(T0))
    expect(w.lte).toEqual(new Date(T0 + ELAPSED * 1000 + 3_600_000))
  })
})
