import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await prisma.account.deleteMany({
    where: { userId: session.user.id, provider: "spotify" },
  })

  return NextResponse.json({ success: true })
}
