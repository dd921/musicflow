import { describe, it, expect } from "vitest";
import { summarizeActivityComfort } from "@/lib/activities-comfort";
import type { WeatherSample } from "@/lib/weather/types";

function sample(dew: number | undefined): WeatherSample {
  return {
    distance_meters: 0, lat: 0, lng: 0, timestamp: 0,
    temp_f: 0, humidity_pct: 0, wind_speed_mph: 0, wind_direction: 0,
    precipitation_mm: 0, feels_like_f: 0, dew_point_f: dew,
  };
}

describe("summarizeActivityComfort", () => {
  it("scores the average dew point across samples", () => {
    expect(summarizeActivityComfort([sample(48), sample(52)])?.band).toBe(1);
  });
  it("returns null when no samples have dew point or input is null", () => {
    expect(summarizeActivityComfort([sample(undefined)])).toBeNull();
    expect(summarizeActivityComfort([])).toBeNull();
    expect(summarizeActivityComfort(null)).toBeNull();
  });
});
