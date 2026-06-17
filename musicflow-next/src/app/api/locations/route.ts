import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { searchLocations } from "@/lib/weather/geocode";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locations = await prisma.savedLocation.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(locations);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();

  if (
    typeof body.lat === "number" &&
    typeof body.lng === "number" &&
    typeof body.timezone === "string" &&
    typeof body.name === "string"
  ) {
    const loc = await prisma.savedLocation.create({
      data: { userId: session.user.id, name: body.name, lat: body.lat, lng: body.lng, timezone: body.timezone },
    });
    return NextResponse.json(loc, { status: 201 });
  }

  if (typeof body.name === "string" && body.name.trim().length > 0) {
    const candidates = await searchLocations(body.name.trim());
    return NextResponse.json({ candidates });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
