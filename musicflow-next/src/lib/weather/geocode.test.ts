import { describe, it, expect } from "vitest";
import { buildGeocodeUrl, parseGeocode } from "@/lib/weather/geocode";

describe("buildGeocodeUrl", () => {
  it("builds a search URL for a place name", () => {
    const url = buildGeocodeUrl("Philadelphia");
    expect(url).toContain("geocoding-api.open-meteo.com/v1/search");
    expect(url).toContain("name=Philadelphia");
  });
});

describe("parseGeocode", () => {
  it("maps results to typed candidates", () => {
    const results = parseGeocode({
      results: [
        { name: "Philadelphia", latitude: 39.9526, longitude: -75.1652, timezone: "America/New_York", admin1: "Pennsylvania", country: "United States" },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].lat).toBeCloseTo(39.9526);
    expect(results[0].timezone).toBe("America/New_York");
  });

  it("returns [] when there are no results", () => {
    expect(parseGeocode({})).toEqual([]);
  });
});
