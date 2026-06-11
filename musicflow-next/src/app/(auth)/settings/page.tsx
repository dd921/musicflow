import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ConnectButton } from "@/components/connect-buttons"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    select: { provider: true },
  })

  const stravaConnected = accounts.some((a) => a.provider === "strava")
  const spotifyConnected = accounts.some((a) => a.provider === "spotify")

  return (
    <div className="max-w-2xl space-y-8">
      <div className="rise-in">
        <p className="eyebrow mb-2">Account</p>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your connected accounts and preferences
        </p>
      </div>

      <div
        className="card-surface rounded-2xl p-6 space-y-6 rise-in"
        style={{ animationDelay: "80ms" }}
      >
        <h3 className="text-lg font-semibold tracking-tight">
          Connected Accounts
        </h3>
        <div className="space-y-4">
          <ConnectButton provider="strava" connected={stravaConnected} />
          <ConnectButton provider="spotify" connected={spotifyConnected} />
        </div>
      </div>

      <div
        className="card-surface rounded-2xl p-6 space-y-4 rise-in"
        style={{ animationDelay: "160ms" }}
      >
        <h3 className="text-lg font-semibold tracking-tight">Profile</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Username</span>
            <span>{session.user.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
