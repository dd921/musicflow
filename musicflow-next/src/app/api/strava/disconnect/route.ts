import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Strava is the only login method for password-less (Strava sign-in) users —
  // disconnecting it would lock them out of their account.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  })
  if (!user?.passwordHash) {
    return NextResponse.json(
      { error: "Set a password before disconnecting Strava — it's your only sign-in method." },
      { status: 409 }
    )
  }

  await prisma.account.deleteMany({
    where: { userId: session.user.id, provider: "strava" },
  })

  return NextResponse.json({ success: true })
}
