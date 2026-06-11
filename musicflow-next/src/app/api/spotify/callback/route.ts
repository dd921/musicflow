import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { exchangeSpotifyCode } from "@/lib/spotify"

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
    return NextResponse.redirect(new URL("/settings?error=spotify_denied", appUrl))
  }

  const tokens = await exchangeSpotifyCode(code)
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in

  await prisma.account.upsert({
    where: { userId_provider: { userId: session.user.id, provider: "spotify" } },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
    },
    create: {
      userId: session.user.id,
      provider: "spotify",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      scope: tokens.scope,
    },
  })

  return NextResponse.redirect(new URL("/settings?success=spotify_connected", appUrl))
}
