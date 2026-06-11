import Link from "next/link"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { syncStravaActivities } from "@/lib/sync-strava"

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDistance(meters: number): string {
  const km = meters / 1000
  return km >= 1 ? `${km.toFixed(2)} km` : `${meters} m`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

const SPORT_ICONS: Record<string, string> = {
  Run: "🏃",
  Ride: "🚴",
  Swim: "🏊",
  Walk: "🚶",
  Hike: "🥾",
  WeightTraining: "🏋️",
  Workout: "💪",
  Yoga: "🧘",
  Skiing: "⛷️",
  Snowboard: "🏂",
}

export default async function ActivitiesPage() {
  const session = await auth()

  const activities = await prisma.activity.findMany({
    where: { userId: session!.user!.id! },
    orderBy: { startDate: "desc" },
    take: 50,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Activities</h2>
          <p className="text-muted-foreground mt-1">
            {activities.length === 0
              ? "No activities synced yet"
              : `${activities.length} most recent activities`}
          </p>
        </div>
        <SyncButton />
      </div>

      {activities.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">🏃</p>
          <p className="text-muted-foreground">
            Connect Strava and sync your activities to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => (
            <Link
              key={activity.id}
              href={`/activities/${activity.id}`}
              className="glass rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors block"
            >
              <span className="text-2xl shrink-0">
                {SPORT_ICONS[activity.type] ?? "⚡"}
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{activity.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(activity.startDate)} · {activity.type}
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground shrink-0">
                <div className="text-right">
                  <p className="text-foreground font-medium tabular-nums">
                    {formatDuration(activity.movingTime)}
                  </p>
                  <p>Duration</p>
                </div>
                {activity.distance > 0 && (
                  <div className="text-right">
                    <p className="text-foreground font-medium tabular-nums">
                      {formatDistance(activity.distance)}
                    </p>
                    <p>Distance</p>
                  </div>
                )}
                {activity.averageHeartrate && (
                  <div className="text-right">
                    <p className="text-foreground font-medium tabular-nums">
                      {Math.round(activity.averageHeartrate)} bpm
                    </p>
                    <p>Avg HR</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SyncButton() {
  async function syncAction() {
    "use server"
    const session = await auth()
    if (!session?.user?.id) return
    await syncStravaActivities(session.user.id)
    revalidatePath("/activities")
  }

  return (
    <form action={syncAction}>
      <button
        type="submit"
        className="px-4 py-2 rounded-lg text-sm font-medium glass hover:bg-white/10 transition-colors"
      >
        Sync Strava
      </button>
    </form>
  )
}
