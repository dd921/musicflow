import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchForecast } from "@/lib/weather/forecast";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) return NextResponse.json({ error: "Missing locationId" }, { status: 400 });

  const location = await prisma.savedLocation.findFirst({
    where: { id: locationId, userId: session.user.id },
  });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { runStartHour: true, runEndHour: true },
  });
  const startHour = user?.runStartHour ?? 5;
  const endHour = user?.runEndHour ?? 21;

  try {
    const days = await fetchForecast(location.lat, location.lng, location.timezone, startHour, endHour);
    return NextResponse.json({ location, days });
  } catch (e) {
    console.error("Forecast fetch failed:", e);
    return NextResponse.json({ error: "Weather service unavailable" }, { status: 502 });
  }
}
