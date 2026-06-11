import Link from "next/link"
import { revalidatePath } from "next/cache"
import { Activity, ChevronRight, Clock, Music, RefreshCw } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { syncSpotifyTracks } from "@/lib/sync-spotify"
import { syncStravaActivities } from "@/lib/sync-strava"
import { SportIcon } from "@/components/sport-icon"

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

  const stats = [
    {
      label: "Activities",
      value: activityCount || "—",
      icon: Activity,
      chip: "border-primary/20 bg-primary/10 text-primary",
    },
    {
      label: "Tracks Synced",
      value: trackCount || "—",
      icon: Music,
      chip: "border-accent/20 bg-accent/10 text-accent",
    },
    {
      label: "Hours of Music",
      value: hoursOfMusic || "—",
      icon: Clock,
      chip: "border-chart-3/20 bg-chart-3/10 text-chart-3",
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 rise-in">
        <div>
          <p className="eyebrow mb-2">Dashboard</p>
          <h2 className="text-3xl font-bold tracking-tight">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium card-surface card-hover shrink-0"
          >
            <RefreshCw className="size-3.5" />
            Sync all
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="card-surface rounded-2xl p-6 rise-in"
            style={{ animationDelay: `${80 + i * 70}ms` }}
          >
            <div className="flex items-center gap-4">
              <span
                className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl border ${stat.chip}`}
              >
                <stat.icon className="size-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {recentActivities.length === 0 ? (
        <div
          className="card-surface rounded-2xl p-8 text-center rise-in"
          style={{ animationDelay: "300ms" }}
        >
          <p className="text-muted-foreground">
            Your recent activities will appear here once you sync your accounts.
          </p>
        </div>
      ) : (
        <div className="space-y-3 rise-in" style={{ animationDelay: "300ms" }}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold tracking-tight">
              Recent Activities
            </h3>
            <Link
              href="/activities"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentActivities.map((a) => (
              <Link
                key={a.id}
                href={`/activities/${a.id}`}
                className="card-surface card-hover rounded-2xl p-4 flex items-center gap-4 block"
              >
                <SportIcon type={a.type} />
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
                <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
