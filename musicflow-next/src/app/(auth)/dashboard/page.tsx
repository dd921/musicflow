import { auth } from "@/auth"

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold">
          Welcome back, {session?.user?.name}
        </h2>
        <p className="text-muted-foreground mt-1">
          Connect Strava and Spotify to get started
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Activities", value: "—", icon: "🏃" },
          { label: "Tracks Synced", value: "—", icon: "🎵" },
          { label: "Hours of Music", value: "—", icon: "⏱" },
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

      <div className="glass rounded-xl p-8 text-center">
        <p className="text-muted-foreground">
          Your recent activities will appear here once you connect your accounts.
        </p>
      </div>
    </div>
  )
}
