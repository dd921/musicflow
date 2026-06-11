import Link from "next/link"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { syncSpotifyTracks } from "@/lib/sync-spotify"
import { syncStravaActivities } from "@/lib/sync-strava"

export default async function DashboardPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const [activityCount, trackCount, trackDuration] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.track.count({ where: { userId } }),
    prisma.track.aggregate({
      where: { userId },
      _sum: { durationMs: true },
    }),
  ])

  const hoursOfMusic = Math.round((trackDuration._sum.durationMs ?? 0) / 3_600_000)

  const recentActivities = await prisma.activity.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    take: 5,
  })

  async function syncAll() {
    "use server"
    const s = await auth()
    if (!s?.user?.id) return
    await Promise.all([
      syncSpotifyTracks(s.user.id),
      syncStravaActivities(s.user.id),
    ])
    revalidatePath("/dashboard")
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">
            Welcome back, {session?.user?.name}
          </h2>
          <p className="text-muted-foreground mt-1">
            {activityCount === 0
              ? "Connect Strava and Spotify to get started"
              : "Here's what's been happening"}
          </p>
        </div>
        <form action={syncAll}>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium glass hover:bg-white/10 transition-colors shrink-0"
          >
            Sync all
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Activities", value: activityCount || "—", icon: "🏃" },
          { label: "Tracks Synced", value: trackCount || "—", icon: "🎵" },
          { label: "Hours of Music", value: hoursOfMusic || "—", icon: "⏱" },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stat.icon}</span>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {recentActivities.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-muted-foreground">
            Your recent activities will appear here once you sync your accounts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Recent Activities</h3>
          <div className="space-y-2">
            {recentActivities.map((a) => (
              <Link
                key={a.id}
                href={`/activities/${a.id}`}
                className="glass rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors block"
              >
                <span className="text-xl">🏃</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                    }).format(a.startDate)}{" "}
                    · {a.type}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <Link
            href="/activities"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors block text-center pt-2"
          >
            View all activities →
          </Link>
        </div>
      )}
    </div>
  )
}
