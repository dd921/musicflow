// Google Encoded Polyline Algorithm Format, precision 5

export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    lat += decodeValue()
    lng += decodeValue()
    coords.push([lat / 1e5, lng / 1e5])
  }

  return coords

  function decodeValue(): number {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
}

export function encodePolyline(coords: [number, number][]): string {
  let encoded = ""
  let prevLat = 0
  let prevLng = 0

  for (const [lat, lng] of coords) {
    const latE5 = Math.round(lat * 1e5)
    const lngE5 = Math.round(lng * 1e5)
    encoded += encodeValue(latE5 - prevLat) + encodeValue(lngE5 - prevLng)
    prevLat = latE5
    prevLng = lngE5
  }

  return encoded
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1
  let out = ""
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>= 5
  }
  out += String.fromCharCode(v + 63)
  return out
}
