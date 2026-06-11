export const TRACK_COLORS = [
  "#FF6B35",
  "#1DB954",
  "#FF3366",
  "#667eea",
  "#f39c12",
  "#2ecc71",
  "#e74c3c",
  "#9b59b6",
  "#3498db",
  "#1abc9c",
  "#e67e22",
  "#16a085",
]

const MAX_TRACK_DURATION_MS = 60 * 60 * 1000

export type TrackPlay = {
  id: string
  name: string
  artists: string[]
  album: string
  albumArt: string | null
  albumArtSmall: string | null
  // Spotify's played_at marks when playback FINISHED (verified empirically:
  // gaps between consecutive played_at values match the later track's duration)
  playedAt: Date
  durationMs: number
}

export type TrackSegment = {
  id: string
  name: string
  artists: string[]
  album: string
  albumArt: string | null
  albumArtSmall: string | null
  startSec: number
  endSec: number
}

export function trackQueryWindow(activityStartMs: number, activityEndMs: number) {
  return {
    gte: new Date(activityStartMs),
    lte: new Date(activityEndMs + MAX_TRACK_DURATION_MS),
  }
}

// plays must be sorted by playedAt ascending
export function computeTrackSegments(
  plays: TrackPlay[],
  activityStartMs: number,
  elapsedSec: number
): TrackSegment[] {
  const activityEndMs = activityStartMs + elapsedSec * 1000
  const segments: TrackSegment[] = []
  let prevFinishMs = -Infinity

  for (const p of plays) {
    const finishMs = p.playedAt.getTime()
    // If the previous play finished inside this track's nominal window, this
    // track was started late (previous one skipped) — clamp to the real start
    const startMs = Math.max(finishMs - p.durationMs, prevFinishMs)
    prevFinishMs = finishMs

    if (finishMs <= activityStartMs || startMs >= activityEndMs) continue

    segments.push({
      id: p.id,
      name: p.name,
      artists: p.artists,
      album: p.album,
      albumArt: p.albumArt,
      albumArtSmall: p.albumArtSmall,
      startSec: Math.max(0, (startMs - activityStartMs) / 1000),
      endSec: Math.min(elapsedSec, (finishMs - activityStartMs) / 1000),
    })
  }
  return segments
}
