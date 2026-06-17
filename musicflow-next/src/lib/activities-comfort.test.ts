import { describe, it, expect } from "vitest";
import {
  summarizeActivityComfort,
  summarizeActivityWeather,
} from "@/lib/activities-comfort";
import type { WeatherSample } from "@/lib/weather/types";

function sample(dew: number | undefined, feels = 0): WeatherSample {
  return {
    distance_meters: 0, lat: 0, lng: 0, timestamp: 0,
    temp_f: 0, humidity_pct: 0, wind_speed_mph: 0, wind_direction: 0,
    precipitation_mm: 0, feels_like_f: feels, dew_point_f: dew,
  };
}

describe("summarizeActivityComfort", () => {
  it("scores the average dew point across samples", () => {
    expect(summarizeActivityComfort([sample(48), sample(52)])?.band).toBe(1);
  });
  it("bumps the band when the average apparent temperature is hot", () => {
    // dew 50 → band 1; feels-like 90 adds one heat bump → band 2
    expect(summarizeActivityComfort([sample(50, 90)])?.band).toBe(2);
  });
  it("returns null when no samples have dew point or input is null", () => {
    expect(summarizeActivityComfort([sample(undefined)])).toBeNull();
    expect(summarizeActivityComfort([])).toBeNull();
    expect(summarizeActivityComfort(null)).toBeNull();
  });
});

describe("summarizeActivityWeather", () => {
  it("averages the weather fields and includes a comfort rating", () => {
    const s = summarizeActivityWeather([sample(48, 80), sample(52, 86)]);
    expect(s?.dewPointF).toBeCloseTo(50, 5);
    expect(s?.feelsLikeF).toBeCloseTo(83, 5);
    expect(s?.comfort.band).toBe(1);
  });
  it("returns null without dew point data", () => {
    expect(summarizeActivityWeather(null)).toBeNull();
    expect(summarizeActivityWeather([sample(undefined)])).toBeNull();
  });
});
