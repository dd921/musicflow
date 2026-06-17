import type { WeatherSample } from "./types";

interface GpsSample {
  distance_meters: number;
  lat: number;
  lng: number;
  timestamp: number;
}

/**
 * Sample GPS points at approximately `intervalMeters` apart.
 * Always includes the first and last point.
 */
export function sampleGpsPoints(
  latlngs: [number, number][],
  distances: number[],
  timestamps: number[],
  intervalMeters = 1000
): GpsSample[] {
  if (latlngs.length === 0) return [];

  const samples: GpsSample[] = [
    { distance_meters: distances[0], lat: latlngs[0][0], lng: latlngs[0][1], timestamp: timestamps[0] },
  ];
  let lastSampledDist = distances[0];

  for (let i = 1; i < latlngs.length; i++) {
    if (distances[i] - lastSampledDist >= intervalMeters) {
      samples.push({ distance_meters: distances[i], lat: latlngs[i][0], lng: latlngs[i][1], timestamp: timestamps[i] });
      lastSampledDist = distances[i];
    }
  }

  const lastIdx = latlngs.length - 1;
  if (distances[lastIdx] - lastSampledDist > 100) {
    samples.push({ distance_meters: distances[lastIdx], lat: latlngs[lastIdx][0], lng: latlngs[lastIdx][1], timestamp: timestamps[lastIdx] });
  }

  return samples;
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function buildWeatherUrl(lat: number, lng: number, date: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: date,
    end_date: date,
    hourly:
      "temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,precipitation,apparent_temperature",
    timezone: "UTC",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params}`;
}

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    dew_point_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    precipitation: number[];
    apparent_temperature: number[];
  };
}

export function parseWeatherResponse(
  response: OpenMeteoResponse,
  isoTime: string
): Omit<WeatherSample, "distance_meters" | "lat" | "lng" | "timestamp"> {
  const targetHour = new Date(isoTime).getUTCHours();
  const hours = response.hourly.time.map((t) => new Date(t + ":00Z").getUTCHours());

  let closestIdx = 0;
  let minDiff = Math.abs(hours[0] - targetHour);
  for (let i = 1; i < hours.length; i++) {
    const diff = Math.abs(hours[i] - targetHour);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }

  return {
    temp_f: celsiusToFahrenheit(response.hourly.temperature_2m[closestIdx]),
    humidity_pct: response.hourly.relative_humidity_2m[closestIdx],
    wind_speed_mph: kmhToMph(response.hourly.wind_speed_10m[closestIdx]),
    wind_direction: response.hourly.wind_direction_10m[closestIdx],
    precipitation_mm: response.hourly.precipitation[closestIdx],
    feels_like_f: celsiusToFahrenheit(response.hourly.apparent_temperature[closestIdx]),
    dew_point_f: celsiusToFahrenheit(response.hourly.dew_point_2m[closestIdx]),
  };
}

/**
 * Fetch weather for a set of GPS samples. Groups by date to minimize API calls.
 */
export async function fetchWeatherForSamples(samples: GpsSample[]): Promise<WeatherSample[]> {
  const results: WeatherSample[] = [];

  const byDate = new Map<string, GpsSample[]>();
  for (const s of samples) {
    const date = new Date(s.timestamp * 1000).toISOString().slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(s);
  }

  for (const [date, dateSamples] of byDate) {
    const avgLat = dateSamples.reduce((sum, s) => sum + s.lat, 0) / dateSamples.length;
    const avgLng = dateSamples.reduce((sum, s) => sum + s.lng, 0) / dateSamples.length;

    const res = await fetch(buildWeatherUrl(avgLat, avgLng, date));
    if (!res.ok) {
      console.error(`Open-Meteo error for ${date}: ${res.status}`);
      continue;
    }
    const data: OpenMeteoResponse = await res.json();

    for (const sample of dateSamples) {
      const isoTime = new Date(sample.timestamp * 1000).toISOString();
      const weather = parseWeatherResponse(data, isoTime);
      results.push({
        distance_meters: sample.distance_meters,
        lat: sample.lat,
        lng: sample.lng,
        timestamp: sample.timestamp,
        ...weather,
      });
    }
  }

  return results;
}
