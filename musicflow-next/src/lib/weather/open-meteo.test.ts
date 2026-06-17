import { describe, it, expect } from "vitest";
import {
  sampleGpsPoints,
  buildWeatherUrl,
  parseWeatherResponse,
} from "@/lib/weather/open-meteo";

describe("sampleGpsPoints", () => {
  it("samples GPS points at approximately 1km intervals", () => {
    const latlngs: [number, number][] = [];
    const distances: number[] = [];
    const timestamps: number[] = [];
    const baseTime = 1700000000;
    for (let i = 0; i < 10; i++) {
      latlngs.push([40.7128 + i * 0.005, -74.006]);
      distances.push(i * 500);
      timestamps.push(baseTime + i * 180);
    }
    const samples = sampleGpsPoints(latlngs, distances, timestamps, 1000);
    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(samples.length).toBeLessThanOrEqual(6);
    expect(samples[0].distance_meters).toBe(0);
    expect(samples[0].lat).toBe(40.7128);
  });
});

describe("buildWeatherUrl", () => {
  it("constructs Open-Meteo archive URL including dew point", () => {
    const url = buildWeatherUrl(40.7128, -74.006, "2024-03-15");
    expect(url).toContain("archive-api.open-meteo.com");
    expect(url).toContain("latitude=40.7128");
    expect(url).toContain("dew_point_2m");
    expect(url).toContain("temperature_2m");
  });
});

describe("parseWeatherResponse", () => {
  it("extracts hourly weather incl dew point, finds closest hour", () => {
    const response = {
      hourly: {
        time: ["2024-03-15T10:00", "2024-03-15T11:00", "2024-03-15T12:00"],
        temperature_2m: [15.0, 16.5, 18.0],
        relative_humidity_2m: [65, 60, 55],
        dew_point_2m: [8.0, 9.0, 10.0],
        wind_speed_10m: [10.0, 12.0, 8.0],
        wind_direction_10m: [180, 190, 200],
        precipitation: [0, 0, 0.5],
        apparent_temperature: [14.0, 15.5, 17.0],
      },
    };
    const result = parseWeatherResponse(response, "2024-03-15T10:30:00Z");
    expect(result.temp_f).toBeCloseTo(59.0, 0);
    expect(result.humidity_pct).toBe(65);
    expect(result.dew_point_f).toBeCloseTo(46.4, 0);
    expect(result.feels_like_f).toBeCloseTo(57.2, 0);
  });
});
