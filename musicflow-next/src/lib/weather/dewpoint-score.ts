import type { DewPointComfort } from "./types";

/**
 * Standard runner's dew-point comfort scale (°F).
 * Lower band is better. Boundaries are inclusive-lower / exclusive-upper.
 */
export function scoreDewPoint(dewPointF: number): DewPointComfort {
  if (dewPointF < 50)
    return { band: 0, label: "Ideal", color: "bg-sky-500", advice: "Hardly noticeable — great conditions for any run." };
  if (dewPointF < 55)
    return { band: 1, label: "Very comfortable", color: "bg-teal-500", advice: "Excellent conditions, including hard efforts." };
  if (dewPointF < 60)
    return { band: 2, label: "Comfortable", color: "bg-green-500", advice: "Fine for most efforts." };
  if (dewPointF < 65)
    return { band: 3, label: "Getting sticky", color: "bg-yellow-500", advice: "Easy effort is fine; ease back on hard workouts." };
  if (dewPointF < 70)
    return { band: 4, label: "Uncomfortable", color: "bg-orange-500", advice: "Expect slower paces and noticeably higher effort." };
  if (dewPointF < 75)
    return { band: 5, label: "Difficult", color: "bg-red-500", advice: "Hard efforts are risky — hydrate and slow down." };
  return { band: 6, label: "Dangerous", color: "bg-purple-700", advice: "Limit intensity or reschedule the run." };
}
