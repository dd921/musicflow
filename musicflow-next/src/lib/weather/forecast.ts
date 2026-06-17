import type { ForecastDay, ForecastHour } from "./types";
import { scoreComfort } from "./dewpoint-score";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}
function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function buildForecastUrl(lat: number, lng: number, timezone: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly:
      "dew_point_2m,temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m",
    forecast_days: "7",
    timezone,
  });
  return `${FORECAST_URL}?${params}`;
}

interface ForecastResponse {
  hourly: {
    time: string[];
    dew_point_2m: number[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    apparent_temperature: number[];
    precipitation: number[];
    wind_speed_10m: number[];
  };
}

export function parseForecast(response: ForecastResponse): ForecastHour[] {
  const h = response.hourly;
  return h.time.map((t, i) => {
    const dew_point_f = celsiusToFahrenheit(h.dew_point_2m[i]);
    const feels_like_f = celsiusToFahrenheit(h.apparent_temperature[i]);
    return {
      time: t,
      hour: parseInt(t.slice(11, 13), 10),
      dew_point_f,
      temp_f: celsiusToFahrenheit(h.temperature_2m[i]),
      humidity_pct: h.relative_humidity_2m[i],
      feels_like_f,
      precipitation_mm: h.precipitation[i],
      wind_speed_mph: kmhToMph(h.wind_speed_10m[i]),
      comfort: scoreComfort(dew_point_f, feels_like_f),
    };
  });
}

/**
 * Best hour within [startHour, endHour] inclusive: lowest composite comfort band,
 * tie-broken by lower feels-like, then lower dew point.
 */
export function selectBestWindow(
  hours: ForecastHour[],
  startHour: number,
  endHour: number
): ForecastHour | null {
  const inWindow = hours.filter((h) => h.hour >= startHour && h.hour <= endHour);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((best, h) => {
    if (h.comfort.band !== best.comfort.band)
      return h.comfort.band < best.comfort.band ? h : best;
    if (h.feels_like_f !== best.feels_like_f)
      return h.feels_like_f < best.feels_like_f ? h : best;
    return h.dew_point_f < best.dew_point_f ? h : best;
  });
}

export function groupByDay(
  hours: ForecastHour[],
  startHour: number,
  endHour: number
): ForecastDay[] {
  const byDate = new Map<string, ForecastHour[]>();
  for (const h of hours) {
    const date = h.time.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(h);
  }
  return Array.from(byDate.entries()).map(([date, dayHours]) => ({
    date,
    hours: dayHours,
    bestWindow: selectBestWindow(dayHours, startHour, endHour),
  }));
}

export async function fetchForecast(
  lat: number,
  lng: number,
  timezone: string,
  startHour: number,
  endHour: number
): Promise<ForecastDay[]> {
  const res = await fetch(buildForecastUrl(lat, lng, timezone), {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Open-Meteo forecast error: ${res.status}`);
  const data = (await res.json()) as ForecastResponse;
  return groupByDay(parseForecast(data), startHour, endHour);
}
