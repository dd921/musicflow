import type { DewPointComfort, WeatherSample } from "./weather/types";
import { scoreComfort } from "./weather/dewpoint-score";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function avgField(
  samples: WeatherSample[],
  pick: (s: WeatherSample) => number | undefined
): number | null {
  return average(
    samples
      .map(pick)
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v))
  );
}

export function summarizeActivityComfort(
  samples: WeatherSample[] | null
): DewPointComfort | null {
  return summarizeActivityWeather(samples)?.comfort ?? null;
}

export interface ActivityWeatherSummary {
  comfort: DewPointComfort;
  dewPointF: number;
  feelsLikeF: number;
  tempF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  precipMm: number | null;
}

export function summarizeActivityWeather(
  samples: WeatherSample[] | null
): ActivityWeatherSummary | null {
  if (!samples || samples.length === 0) return null;
  const avgDew = avgField(samples, (s) => s.dew_point_f);
  if (avgDew == null) return null;
  const avgFeels = avgField(samples, (s) => s.feels_like_f) ?? avgDew;
  return {
    comfort: scoreComfort(avgDew, avgFeels),
    dewPointF: avgDew,
    feelsLikeF: avgFeels,
    tempF: avgField(samples, (s) => s.temp_f),
    humidityPct: avgField(samples, (s) => s.humidity_pct),
    windMph: avgField(samples, (s) => s.wind_speed_mph),
    precipMm: average(samples.map((s) => s.precipitation_mm ?? 0)),
  };
}
