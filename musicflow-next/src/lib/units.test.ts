import { describe, expect, it } from "vitest"
import {
  METERS_PER_FOOT,
  METERS_PER_MILE,
  formatDistance,
  formatElevation,
  formatPace,
  formatSpeed,
  metersToFeet,
  metersToKm,
  metersToMiles,
  paceMinPerKmToMinPerMi,
  type UnitSystem,
} from "./units"

describe("constants", () => {
  it("uses exact international definitions", () => {
    expect(METERS_PER_MILE).toBe(1609.344)
    expect(METERS_PER_FOOT).toBe(0.3048)
  })
})

describe("conversion primitives", () => {
  it("metersToKm divides by 1000", () => {
    expect(metersToKm(5210)).toBeCloseTo(5.21, 10)
  })

  it("metersToMiles converts one exact mile", () => {
    expect(metersToMiles(1609.344)).toBe(1)
  })

  it("metersToFeet converts one exact foot", () => {
    expect(metersToFeet(0.3048)).toBeCloseTo(1, 10)
  })
})

describe("formatDistance", () => {
  it("formats metric distances in km with 2 decimals", () => {
    expect(formatDistance(5210, "metric")).toBe("5.21 km")
  })

  it("formats metric distances under 1 km in whole meters", () => {
    expect(formatDistance(850, "metric")).toBe("850 m")
  })

  it("formats exactly 1 km as km", () => {
    expect(formatDistance(1000, "metric")).toBe("1.00 km")
  })

  it("formats one exact mile as 1.00 mi", () => {
    expect(formatDistance(1609.344, "imperial")).toBe("1.00 mi")
  })

  it("formats 5000 m as 3.11 mi", () => {
    expect(formatDistance(5000, "imperial")).toBe("3.11 mi")
  })

  it("formats imperial distances under 0.1 mi in whole feet", () => {
    // 120 ft = 36.576 m, well under 0.1 mi (160.9344 m)
    expect(formatDistance(36.576, "imperial")).toBe("120 ft")
  })
})

describe("formatElevation", () => {
  it("formats metric elevation as rounded meters", () => {
    expect(formatElevation(142, "metric")).toBe("142 m")
  })

  it("formats imperial elevation as rounded feet", () => {
    expect(formatElevation(142, "imperial")).toBe("466 ft")
  })

  it("converts 1000 m to 3281 ft", () => {
    expect(formatElevation(1000, "imperial")).toBe("3281 ft")
  })
})

describe("formatPace", () => {
  it("formats metric pace as min:sec per km", () => {
    // 1650 s over 5 km = 330 s/km
    expect(formatPace(1650, 5000, "metric")).toBe("5:30 /km")
  })

  it("zero-pads the seconds component", () => {
    // 305 s over 1 km
    expect(formatPace(305, 1000, "metric")).toBe("5:05 /km")
  })

  it("returns an em dash for zero distance", () => {
    expect(formatPace(600, 0, "metric")).toBe("—")
  })

  it("returns an em dash for negative distance", () => {
    expect(formatPace(600, -5, "metric")).toBe("—")
  })

  it("rolls over to the next minute when seconds round to 60", () => {
    // 2997 s over 10 km = 299.7 s/km = 4:59.7 -> must be 5:00, never 4:60
    expect(formatPace(2997, 10000, "metric")).toBe("5:00 /km")
  })

  it("renders the same run consistently in metric and imperial", () => {
    // one exact mile run at 5:00 /km pace (482.8032 s total)
    const time = 300 * (METERS_PER_MILE / 1000)
    expect(formatPace(time, METERS_PER_MILE, "metric")).toBe("5:00 /km")
    // 482.8032 s/mi = 8:02.8 -> rounds to 8:03
    expect(formatPace(time, METERS_PER_MILE, "imperial")).toBe("8:03 /mi")
  })
})

describe("formatSpeed", () => {
  it("formats metric speed in km/h with 1 decimal", () => {
    expect(formatSpeed(9, "metric")).toBe("32.4 km/h")
  })

  it("formats imperial speed in mph with 1 decimal", () => {
    // 9 m/s = 20.132... mph
    expect(formatSpeed(9, "imperial")).toBe("20.1 mph")
  })
})

describe("paceMinPerKmToMinPerMi", () => {
  it("scales pace by meters-per-mile over meters-per-km", () => {
    expect(paceMinPerKmToMinPerMi(5)).toBeCloseTo(8.04672, 10)
  })
})

describe("UnitSystem type", () => {
  it("accepts both unit systems", () => {
    const systems: UnitSystem[] = ["metric", "imperial"]
    expect(systems).toHaveLength(2)
  })
})
