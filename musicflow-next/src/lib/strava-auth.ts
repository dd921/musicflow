import type { Account } from "next-auth"
import { prisma } from "@/lib/prisma"

export type StravaProfile = {
  id: number | string
  firstname?: string
  lastname?: string
  profile?: string
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20)
}

async function uniqueUsername(athleteId: string, profile: StravaProfile): Promise<string> {
  const name = `${profile.firstname ?? ""}${profile.lastname ?? ""}`
  const base = slugify(name) || "athlete"
  // `${base}${athleteId}` and `strava${athleteId}` are unique by construction
  // because the Strava athlete id is unique.
  for (const candidate of [base, `${base}${athleteId}`, `strava${athleteId}`]) {
    const taken = await prisma.user.findUnique({ where: { username: candidate } })
    if (!taken) return candidate
  }
  return `strava${athleteId}`
}

/**
 * Find-or-create the MusicFlow user behind a Strava OAuth sign-in and persist
 * the latest tokens to the shared Account table (so the sync engine can use
 * them). Returns the MusicFlow user id to embed in the session JWT.
 */
export async function resolveStravaUser(
  account: Account,
  profile: StravaProfile
): Promise<string> {
  const providerAccountId = String(profile.id)
  const tokenData = {
    accessToken: account.access_token!,
    refreshToken: (account.refresh_token as string | undefined) ?? null,
    expiresAt: (account.expires_at as number | undefined) ?? null,
    scope: (account.scope as string | undefined) ?? "activity:read_all",
  }

  const existing = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "strava", providerAccountId } },
    select: { id: true, userId: true },
  })

  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: tokenData })
    return existing.userId
  }

  const username = await uniqueUsername(providerAccountId, profile)
  const user = await prisma.user.create({
    data: {
      username,
      accounts: {
        create: { provider: "strava", providerAccountId, ...tokenData },
      },
    },
  })
  return user.id
}
