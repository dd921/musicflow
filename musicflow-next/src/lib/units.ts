export type UnitSystem = "metric" | "imperial"

export const METERS_PER_MILE = 1609.344
export const METERS_PER_FOOT = 0.3048

export function metersToKm(meters: number): number {
  return meters / 1000
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE
}

export function metersToFeet(meters: number): number {
  return meters / METERS_PER_FOOT
}

export function formatDistance(meters: number, units: UnitSystem): string {
  if (units === "metric") {
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${metersToKm(meters).toFixed(2)} km`
  }
  const miles = metersToMiles(meters)
  if (miles < 0.1) return `${Math.round(metersToFeet(meters))} ft`
  return `${miles.toFixed(2)} mi`
}

export function formatElevation(meters: number, units: UnitSystem): string {
  if (units === "metric") return `${Math.round(meters)} m`
  return `${Math.round(metersToFeet(meters))} ft`
}

export function formatPace(
  movingTimeSec: number,
  meters: number,
  units: UnitSystem
): string {
  if (meters <= 0) return "—"
  const unitMeters = units === "metric" ? 1000 : METERS_PER_MILE
  const secondsPerUnit = Math.round(movingTimeSec / (meters / unitMeters))
  const minutes = Math.floor(secondsPerUnit / 60)
  const seconds = secondsPerUnit % 60
  const suffix = units === "metric" ? "/km" : "/mi"
  return `${minutes}:${String(seconds).padStart(2, "0")} ${suffix}`
}

export function formatSpeed(metersPerSec: number, units: UnitSystem): string {
  if (units === "metric") return `${(metersPerSec * 3.6).toFixed(1)} km/h`
  return `${((metersPerSec * 3600) / METERS_PER_MILE).toFixed(1)} mph`
}

export function paceMinPerKmToMinPerMi(pace: number): number {
  return pace * (METERS_PER_MILE / 1000)
}
