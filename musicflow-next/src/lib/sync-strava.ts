import { prisma } from "@/lib/prisma"
import { fetchStravaActivities } from "@/lib/strava"
import { getValidToken } from "@/lib/tokens"

const SIX_MONTHS_AGO = () => Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 180

export type StravaSyncResult = {
  inserted: number
  updated: number
  error?: string
}

export async function syncStravaActivities(userId: string): Promise<StravaSyncResult> {
  const accessToken = await getValidToken(userId, "strava")
  if (!accessToken) {
    return { inserted: 0, updated: 0, error: "No valid Strava token" }
  }

  // Check whether this is a first sync (no activities yet) to determine fetch window
  const latest = await prisma.activity.findFirst({
    where: { userId },
    orderBy: { startDate: "desc" },
    select: { startDate: true },
  })

  const after = latest
    ? Math.floor(latest.startDate.getTime() / 1000)
    : SIX_MONTHS_AGO()

  // Page through all results until we get an empty page
  const all: Awaited<ReturnType<typeof fetchStravaActivities>> = []
  let page = 1
  while (true) {
    const batch = await fetchStravaActivities(accessToken, { after, page, perPage: 50 })
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < 50) break
    page++
  }

  if (all.length === 0) return { inserted: 0, updated: 0 }

  let inserted = 0
  let updated = 0

  for (const a of all) {
    const data = {
      userId,
      name: a.name,
      type: a.type,
      startDate: new Date(a.start_date),
      elapsedTime: a.elapsed_time,
      movingTime: a.moving_time,
      distance: a.distance,
      averageHeartrate: a.average_heartrate ?? null,
      maxHeartrate: a.max_heartrate ?? null,
      averageSpeed: a.average_speed,
      maxSpeed: a.max_speed,
      totalElevation: a.total_elevation_gain,
      calories: a.calories ?? null,
      summaryPolyline: a.map?.summary_polyline ?? null,
    }

    const existing = await prisma.activity.findUnique({
      where: { stravaId: BigInt(a.id) },
      select: { id: true },
    })

    if (existing) {
      await prisma.activity.update({
        where: { stravaId: BigInt(a.id) },
        data,
      })
      updated++
    } else {
      await prisma.activity.create({
        data: { stravaId: BigInt(a.id), ...data },
      })
      inserted++
    }
  }

  return { inserted, updated }
}
