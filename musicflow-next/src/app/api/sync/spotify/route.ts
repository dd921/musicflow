import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { syncSpotifyTracks } from "@/lib/sync-spotify"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await syncSpotifyTracks(session.user.id)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(result)
}
