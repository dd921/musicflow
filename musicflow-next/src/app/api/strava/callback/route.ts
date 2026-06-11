import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { exchangeStravaCode } from "@/lib/strava"

export async function GET(request: Request) {
  const session = await auth()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", appUrl))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(new URL("/settings?error=strava_denied", appUrl))
  }

  const tokens = await exchangeStravaCode(code)

  await prisma.account.upsert({
    where: { userId_provider: { userId: session.user.id, provider: "strava" } },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      scope: "activity:read_all",
    },
    create: {
      userId: session.user.id,
      provider: "strava",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      scope: "activity:read_all",
    },
  })

  return NextResponse.redirect(new URL("/settings?success=strava_connected", appUrl))
}
