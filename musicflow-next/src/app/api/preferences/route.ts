import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();

  const data: { runStartHour?: number; runEndHour?: number } = {};
  if (typeof body.run_start_hour === "number") data.runStartHour = Math.min(23, Math.max(0, body.run_start_hour));
  if (typeof body.run_end_hour === "number") data.runEndHour = Math.min(23, Math.max(0, body.run_end_hour));

  if (
    typeof data.runStartHour === "number" &&
    typeof data.runEndHour === "number" &&
    data.runStartHour > data.runEndHour
  ) {
    [data.runStartHour, data.runEndHour] = [data.runEndHour, data.runStartHour];
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { runStartHour: true, runEndHour: true },
  });
  return NextResponse.json(user);
}
