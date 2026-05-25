import { prisma } from "@/lib/prisma"
import { refreshStravaToken } from "@/lib/strava"
import { refreshSpotifyToken } from "@/lib/spotify"

const TOKEN_BUFFER_SECONDS = 300

export async function getValidToken(
  userId: string,
  provider: "strava" | "spotify"
): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { userId_provider: { userId, provider } },
  })
  if (!account) return null

  const now = Math.floor(Date.now() / 1000)

  if (account.expiresAt && account.expiresAt > now + TOKEN_BUFFER_SECONDS) {
    return account.accessToken
  }

  if (!account.refreshToken) return null

  if (provider === "strava") {
    const tokens = await refreshStravaToken(account.refreshToken)
    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at,
      },
    })
    return tokens.access_token
  }

  if (provider === "spotify") {
    const tokens = await refreshSpotifyToken(account.refreshToken)
    const expiresAt = now + tokens.expires_in
    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        expiresAt,
      },
    })
    return tokens.access_token
  }

  return null
}
