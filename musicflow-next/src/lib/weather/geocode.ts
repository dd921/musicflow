const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
  timezone: string;
  admin1?: string;
  country?: string;
}

export function buildGeocodeUrl(name: string): string {
  const params = new URLSearchParams({ name, count: "5", language: "en", format: "json" });
  return `${GEOCODE_URL}?${params}`;
}

interface GeocodeResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    admin1?: string;
    country?: string;
  }>;
}

export function parseGeocode(response: GeocodeResponse): GeocodeResult[] {
  return (response.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lng: r.longitude,
    timezone: r.timezone,
    admin1: r.admin1,
    country: r.country,
  }));
}

export async function searchLocations(name: string): Promise<GeocodeResult[]> {
  const res = await fetch(buildGeocodeUrl(name));
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  return parseGeocode((await res.json()) as GeocodeResponse);
}
