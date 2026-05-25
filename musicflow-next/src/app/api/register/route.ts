import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const body = await request.json()
  const { username, password, email } = body as {
    username?: string
    password?: string
    email?: string
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    )
  }

  if (username.length < 3 || password.length < 6) {
    return NextResponse.json(
      { error: "Username must be 3+ characters, password 6+ characters" },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 })
  }

  const passwordHash = await bcryptjs.hash(password, 12)
  await prisma.user.create({
    data: { username, email: email || null, passwordHash },
  })

  return NextResponse.json({ success: true })
}
