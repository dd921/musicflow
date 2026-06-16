import { prisma } from "@/lib/prisma"
import { getValidToken } from "@/lib/tokens"

type AudioFeature = {
  id: string
  tempo: number | null
  energy: number | null
  danceability: number | null
  valence: number | null
}

type AudioFeaturesResponse = {
  audio_features: (AudioFeature | null)[]
}

export async function backfillAudioFeatures(userId: string): Promise<void> {
  try {
    const accessToken = await getValidToken(userId, "spotify")
    if (!accessToken) return

    // Find tracks with no tempo, deduped by spotifyTrackId, cap at 100
    const tracks = await prisma.track.findMany({
      where: { userId, tempo: null },
      select: { id: true, spotifyTrackId: true },
      orderBy: { storedAt: "desc" },
      take: 100,
    })
    if (tracks.length === 0) return

    // Dedupe by spotifyTrackId — keep first occurrence (most recent)
    const seen = new Set<string>()
    const deduped = tracks.filter((t) => {
      if (seen.has(t.spotifyTrackId)) return false
      seen.add(t.spotifyTrackId)
      return true
    })

    const ids = deduped.map((t) => t.spotifyTrackId).join(",")

    const res = await fetch(
      `https://api.spotify.com/v1/audio-features?ids=${ids}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    // Spotify deprecated this endpoint for newer apps — degrade silently
    if (!res.ok) return

    const data = (await res.json()) as AudioFeaturesResponse
    const features = data.audio_features

    if (!Array.isArray(features)) return

    // Build a map from spotifyTrackId → feature data
    const featureMap = new Map<string, AudioFeature>()
    for (const f of features) {
      if (f && f.id) featureMap.set(f.id, f)
    }

    // Update each track row that has a matching feature
    await Promise.all(
      deduped.map(async (t) => {
        const f = featureMap.get(t.spotifyTrackId)
        if (!f) return
        await prisma.track.updateMany({
          where: { userId, spotifyTrackId: t.spotifyTrackId, tempo: null },
          data: {
            tempo: f.tempo,
            energy: f.energy,
            danceability: f.danceability,
            valence: f.valence,
          },
        })
      })
    )
  } catch {
    // Fire-and-forget — never surface errors to caller
  }
}
