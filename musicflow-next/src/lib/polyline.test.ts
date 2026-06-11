import { describe, expect, it } from "vitest"
import { decodePolyline, encodePolyline } from "./polyline"

// Google's documented example; note the literal backtick in the string
const GOOGLE_EXAMPLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
const GOOGLE_COORDS: [number, number][] = [
  [38.5, -120.2],
  [40.7, -120.95],
  [43.252, -126.453],
]

describe("decodePolyline", () => {
  it("decodes Google's documented example", () => {
    expect(decodePolyline(GOOGLE_EXAMPLE)).toEqual(GOOGLE_COORDS)
  })

  it("decodes the empty string to an empty array", () => {
    expect(decodePolyline("")).toEqual([])
  })

  it("decodes a single-point polyline", () => {
    const encoded = encodePolyline([[38.5, -120.2]])
    expect(decodePolyline(encoded)).toEqual([[38.5, -120.2]])
  })
})

describe("encodePolyline", () => {
  it("encodes Google's documented example", () => {
    expect(encodePolyline(GOOGLE_COORDS)).toBe(GOOGLE_EXAMPLE)
  })

  it("roundtrips coordinates to 5 decimal places", () => {
    const coords: [number, number][] = [
      [40.748817, -73.985428],
      [40.689247, -74.044502],
      [40.706086, -73.996864],
    ]
    const decoded = decodePolyline(encodePolyline(coords))
    expect(decoded).toHaveLength(coords.length)
    decoded.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(coords[i][0], 5)
      expect(lng).toBeCloseTo(coords[i][1], 5)
    })
  })

  it("handles negative coordinates", () => {
    const coords: [number, number][] = [
      [-33.86882, 151.20929],
      [-37.8136, 144.96332],
    ]
    const decoded = decodePolyline(encodePolyline(coords))
    decoded.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(coords[i][0], 5)
      expect(lng).toBeCloseTo(coords[i][1], 5)
    })
  })

  it("encodes an empty array to the empty string", () => {
    expect(encodePolyline([])).toBe("")
  })
})
