import { describe, it, expect } from "vitest";
import {
  buildForecastUrl,
  parseForecast,
  selectBestWindow,
  groupByDay,
} from "@/lib/weather/forecast";

const sampleResponse = {
  hourly: {
    time: ["2026-06-17T04:00", "2026-06-17T06:00", "2026-06-17T18:00"],
    dew_point_2m: [10.0, 7.0, 20.0],
    temperature_2m: [15.0, 12.0, 25.0],
    relative_humidity_2m: [80, 85, 60],
    apparent_temperature: [14.0, 11.0, 26.0],
    precipitation: [0, 0, 0.2],
    wind_speed_10m: [10.0, 5.0, 15.0],
  },
};

describe("buildForecastUrl", () => {
  it("builds a 7-day hourly forecast URL with dew point and timezone", () => {
    const url = buildForecastUrl(40.0, -75.0, "America/New_York");
    expect(url).toContain("api.open-meteo.com/v1/forecast");
    expect(url).toContain("latitude=40");
    expect(url).toContain("dew_point_2m");
    expect(url).toContain("forecast_days=7");
    expect(url).toContain("America%2FNew_York");
  });
});

describe("parseForecast", () => {
  it("maps hourly arrays to typed hours with °F conversion and comfort", () => {
    const hours = parseForecast(sampleResponse);
    expect(hours).toHaveLength(3);
    expect(hours[0].dew_point_f).toBeCloseTo(50.0, 0);
    expect(hours[0].hour).toBe(4);
    expect(hours[0].comfort.band).toBe(1);
    expect(hours[1].comfort.band).toBe(0);
    expect(hours[2].temp_f).toBeCloseTo(77.0, 0);
  });
});

describe("selectBestWindow", () => {
  it("picks the lowest dew point within runnable hours", () => {
    const best = selectBestWindow(parseForecast(sampleResponse), 5, 21);
    expect(best?.hour).toBe(6);
  });
  it("returns null when no hours fall in the window", () => {
    expect(selectBestWindow(parseForecast(sampleResponse), 0, 3)).toBeNull();
  });
});

describe("groupByDay", () => {
  it("groups hours by local date and attaches best window", () => {
    const days = groupByDay(parseForecast(sampleResponse), 5, 21);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-06-17");
    expect(days[0].hours).toHaveLength(3);
    expect(days[0].bestWindow?.hour).toBe(6);
  });
});
