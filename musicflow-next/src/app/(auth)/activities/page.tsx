import Link from "next/link"
import { revalidatePath } from "next/cache"
import { ChevronRight, CloudSun, Footprints, RefreshCw } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { syncStravaActivities } from "@/lib/sync-strava"
import { formatDistance, type UnitSystem } from "@/lib/units"
import { summarizeActivityComfort } from "@/lib/activities-comfort"
import { enrichActivitiesWeather } from "@/lib/weather/enrich"
import type { WeatherSample } from "@/lib/weather/types"
import { SportIcon } from "@/components/sport-icon"
import { RouteThumbnail } from "@/components/route-thumbnail"

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export default async function ActivitiesPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const [activities, user] = await Promise.all([
    prisma.activity.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
      take: 50,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { units: true },
    }),
  ])
  const units = (user?.units ?? "metric") as UnitSystem

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rise-in">
        <div>
          <p className="eyebrow mb-2">Workouts</p>
          <h2 className="text-3xl font-bold tracking-tight">Activities</h2>
          <p className="text-muted-foreground mt-1">
            {activities.length === 0
              ? "No activities synced yet"
              : `${activities.length} most recent activities`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EnrichButton />
          <SyncButton />
        </div>
      </div>

      {activities.length === 0 ? (
        <div
          className="card-surface rounded-2xl p-12 text-center rise-in"
          style={{ animationDelay: "100ms" }}
        >
          <span className="inline-flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary mb-4">
            <Footprints className="size-7" strokeWidth={1.75} />
          </span>
          <p className="text-muted-foreground">
            Connect Strava and sync your activities to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity, i) => (
            <Link
              key={activity.id}
              href={`/activities/${activity.id}`}
              className="card-surface card-hover rounded-2xl p-4 flex items-center gap-4 block rise-in"
              style={{ animationDelay: `${Math.min(i, 10) * 40 + 80}ms` }}
            >
              <SportIcon type={activity.type} />

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{activity.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(activity.startDate)} · {activity.type}
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-8 shrink-0">
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {formatDuration(activity.movingTime)}
                  </p>
                  <p className="eyebrow !text-[0.6rem]">Time</p>
                </div>
                {activity.distance > 0 && (
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatDistance(activity.distance, units)}
                    </p>
                    <p className="eyebrow !text-[0.6rem]">Distance</p>
                  </div>
                )}
                {activity.averageHeartrate && (
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {Math.round(activity.averageHeartrate)}
                      <span className="text-muted-foreground text-sm font-normal"> bpm</span>
                    </p>
                    <p className="eyebrow !text-[0.6rem]">Avg HR</p>
                  </div>
                )}
              </div>

              {activity.summaryPolyline && (
                <RouteThumbnail
                  polyline={activity.summaryPolyline}
                  className="size-12 text-primary/80 shrink-0 hidden sm:block"
                />
              )}

              {(() => {
                const comfort = summarizeActivityComfort(
                  (activity.weather as unknown as WeatherSample[] | null) ?? null
                );
                return comfort ? (
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-semibold text-white ${comfort.color}`}>
                    {comfort.label}
                  </span>
                ) : (
                  <span className="shrink-0 text-[0.65rem] text-muted-foreground/40">—</span>
                );
              })()}

              <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function EnrichButton() {
  async function enrichAction() {
    "use server";
    const session = await auth();
    if (!session?.user?.id) return;
    await enrichActivitiesWeather(session.user.id);
    revalidatePath("/activities");
  }

  return (
    <form action={enrichAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium card-surface card-hover"
      >
        <CloudSun className="size-3.5" />
        Enrich weather
      </button>
    </form>
  );
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
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium card-surface card-hover"
      >
        <RefreshCw className="size-3.5" />
        Sync Strava
      </button>
    </form>
  )
}
