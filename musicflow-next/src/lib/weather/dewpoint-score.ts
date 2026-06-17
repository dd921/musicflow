import type { DewPointComfort } from "./types";

/**
 * Standard runner's dew-point comfort scale (°F).
 * Lower band is better. Each entry's `maxF` is the exclusive upper bound;
 * the top band uses Infinity. Boundaries are inclusive-lower / exclusive-upper.
 */
export const DEW_POINT_BANDS: (DewPointComfort & { maxF: number })[] = [
  { band: 0, maxF: 50, label: "Ideal", color: "bg-sky-500", advice: "Hardly noticeable — great conditions for any run." },
  { band: 1, maxF: 55, label: "Very comfortable", color: "bg-teal-500", advice: "Excellent conditions, including hard efforts." },
  { band: 2, maxF: 60, label: "Comfortable", color: "bg-green-500", advice: "Fine for most efforts." },
  { band: 3, maxF: 65, label: "Getting sticky", color: "bg-yellow-500", advice: "Easy effort is fine; ease back on hard workouts." },
  { band: 4, maxF: 70, label: "Uncomfortable", color: "bg-orange-500", advice: "Expect slower paces and noticeably higher effort." },
  { band: 5, maxF: 75, label: "Difficult", color: "bg-red-500", advice: "Hard efforts are risky — hydrate and slow down." },
  { band: 6, maxF: Infinity, label: "Dangerous", color: "bg-purple-700", advice: "Limit intensity or reschedule the run." },
];

function bandComfort(band: number): DewPointComfort {
  const i = Math.max(0, Math.min(band, DEW_POINT_BANDS.length - 1));
  const b = DEW_POINT_BANDS[i];
  return { band: b.band, label: b.label, color: b.color, advice: b.advice };
}

export function scoreDewPoint(dewPointF: number): DewPointComfort {
  const b =
    DEW_POINT_BANDS.find((x) => dewPointF < x.maxF) ??
    DEW_POINT_BANDS[DEW_POINT_BANDS.length - 1];
  return bandComfort(b.band);
}

/**
 * How much raw heat (apparent temperature) bumps the comfort band beyond what
 * humidity alone explains. Heat only ever worsens the rating; cold never helps a
 * humid day, so there is no downward adjustment.
 */
function heatBump(feelsLikeF: number): number {
  if (feelsLikeF >= 95) return 2;
  if (feelsLikeF >= 85) return 1;
  return 0;
}

/**
 * Composite running heat-stress score. Dew point sets the base band (humidity is
 * the dominant driver for runners); a hot apparent temperature bumps it up. A
 * hot-but-dry day therefore scores far better than a warm humid one.
 */
export function scoreComfort(dewPointF: number, feelsLikeF: number): DewPointComfort {
  const base = scoreDewPoint(dewPointF).band;
  return bandComfort(base + heatBump(feelsLikeF));
}
