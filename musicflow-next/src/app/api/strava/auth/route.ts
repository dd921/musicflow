import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getStravaAuthUrl } from "@/lib/strava"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL!))
  }
  return NextResponse.redirect(getStravaAuthUrl())
}
