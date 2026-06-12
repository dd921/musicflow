"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export type ImportEntry = {
  spotifyTrackId: string
  name: string
  artists: string
  album: string
  durationMs: number
  playedAt: string
}

export async function importSpotifyBatch(
  entries: ImportEntry[]
): Promise<{ imported: number }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not authenticated")
  if (!Array.isArray(entries) || entries.length > 2000) throw new Error("Invalid batch")

  const userId = session.user.id

  const valid = entries.filter(
    (e) =>
      typeof e.spotifyTrackId === "string" &&
      e.spotifyTrackId.length > 0 &&
      typeof e.name === "string" &&
      e.name.length > 0 &&
      typeof e.durationMs === "number" &&
      e.durationMs > 0 &&
      typeof e.playedAt === "string"
  )

  if (valid.length === 0) return { imported: 0 }

  const result = await prisma.track.createMany({
    data: valid.map((e) => ({
      userId,
      spotifyTrackId: e.spotifyTrackId,
      name: e.name,
      artists: e.artists,
      album: e.album,
      durationMs: e.durationMs,
      playedAt: new Date(e.playedAt),
    })),
    skipDuplicates: true,
  })

  return { imported: result.count }
}

export async function setUnits(units: "metric" | "imperial") {
  if (units !== "metric" && units !== "imperial") {
    throw new Error("Invalid unit system")
  }

  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Not authenticated")
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { units },
  })

  revalidatePath("/", "layout")
}
