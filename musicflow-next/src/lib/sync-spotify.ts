import { prisma } from "@/lib/prisma"
import { fetchRecentTracks } from "@/lib/spotify"
import { getValidToken } from "@/lib/tokens"

export type SyncResult = {
  inserted: number
  skipped: number
  error?: string
}

export async function syncSpotifyTracks(userId: string): Promise<SyncResult> {
  const accessToken = await getValidToken(userId, "spotify")
  if (!accessToken) {
    return { inserted: 0, skipped: 0, error: "No valid Spotify token" }
  }

  const items = await fetchRecentTracks(accessToken)
  if (items.length === 0) return { inserted: 0, skipped: 0 }

  const records = items.map((item) => {
    const images = item.track.album.images.sort((a, b) => b.height - a.height)
    return {
      userId,
      spotifyTrackId: item.track.id,
      name: item.track.name,
      artists: JSON.stringify(item.track.artists.map((a) => a.name)),
      album: item.track.album.name,
      albumArt: images[0]?.url ?? null,
      albumArtSmall: images.find((i) => i.height <= 64)?.url ?? images[images.length - 1]?.url ?? null,
      durationMs: item.track.duration_ms,
      playedAt: new Date(item.played_at),
    }
  })

  const result = await prisma.track.createMany({
    data: records,
    skipDuplicates: true,
  })

  return {
    inserted: result.count,
    skipped: records.length - result.count,
  }
}
