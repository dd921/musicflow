import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncSpotifyTracks } from "@/lib/sync-spotify"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const accounts = await prisma.account.findMany({
    where: { provider: "spotify" },
    select: { userId: true },
  })

  const results = await Promise.allSettled(
    accounts.map((a) => syncSpotifyTracks(a.userId))
  )

  const summary = results.map((r, i) => ({
    userId: accounts[i].userId,
    ...(r.status === "fulfilled" ? r.value : { error: String(r.reason) }),
  }))

  return NextResponse.json({ synced: accounts.length, summary })
}
