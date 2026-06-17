import type { DewPointComfort, WeatherSample } from "./weather/types";
import { scoreDewPoint } from "./weather/dewpoint-score";

export function summarizeActivityComfort(
  samples: WeatherSample[] | null
): DewPointComfort | null {
  if (!samples || samples.length === 0) return null;
  const dews = samples
    .map((s) => s.dew_point_f)
    .filter((d): d is number => typeof d === "number" && !Number.isNaN(d));
  if (dews.length === 0) return null;
  const avg = dews.reduce((a, b) => a + b, 0) / dews.length;
  return scoreDewPoint(avg);
}
