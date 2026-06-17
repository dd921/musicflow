import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getValidToken } from "@/lib/tokens";
import { fetchActivityStreams } from "@/lib/strava";
import { sampleGpsPoints, fetchWeatherForSamples } from "./open-meteo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const aLat = (a[0] * Math.PI) / 180;
  const bLat = (b[0] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Fetch streams + per-km weather (incl dew point) for the user's activities that
 * have no weather yet. Idempotent and throttled. Returns counts.
 */
export async function enrichActivitiesWeather(
  userId: string
): Promise<{ enriched: number; skipped: number; error?: string }> {
  const token = await getValidToken(userId, "strava");
  if (!token) return { enriched: 0, skipped: 0, error: "No valid Strava token" };

  const activities = await prisma.activity.findMany({
    where: { userId, weather: { equals: Prisma.DbNull } },
    select: { id: true, stravaId: true, startDate: true },
  });

  let enriched = 0;
  let skipped = 0;

  for (const act of activities) {
    try {
      const streams = await fetchActivityStreams(token, act.stravaId);
      const latlng = streams.latlng?.data;
      const time = streams.time?.data;
      if (!latlng || !time || latlng.length === 0 || time.length === 0) {
        skipped++;
        continue;
      }

      const startUnix = Math.floor(act.startDate.getTime() / 1000);
      const timestamps = time.map((t) => startUnix + t);

      const distances: number[] = [0];
      for (let i = 1; i < latlng.length; i++) {
        distances.push(distances[i - 1] + haversineMeters(latlng[i - 1], latlng[i]));
      }

      const gps = sampleGpsPoints(latlng, distances, timestamps, 1000);
      const samples = await fetchWeatherForSamples(gps);

      await prisma.activity.update({
        where: { id: act.id },
        data: {
          streams: streams as unknown as Prisma.InputJsonValue,
          weather: samples as unknown as Prisma.InputJsonValue,
        },
      });
      enriched++;
    } catch (e) {
      console.error(`Weather enrich failed for activity ${act.id}:`, e);
      skipped++;
    }
    await sleep(250);
  }

  return { enriched, skipped };
}
