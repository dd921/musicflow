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
      <div>
        <h2 className="text-3xl font-bold">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your connected accounts and preferences
        </p>
      </div>

      <div className="glass rounded-xl p-6 space-y-6">
        <h3 className="text-lg font-semibold">Connected Accounts</h3>
        <div className="space-y-4">
          <ConnectButton provider="strava" connected={stravaConnected} />
          <ConnectButton provider="spotify" connected={spotifyConnected} />
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Profile</h3>
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
