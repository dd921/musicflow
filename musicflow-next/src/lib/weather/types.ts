export interface DewPointComfort {
  band: number; // 0 (best) .. 6 (worst)
  label: string;
  color: string; // tailwind bg-* class for grid cells / badges
  advice: string;
}

export interface WeatherSample {
  distance_meters: number;
  lat: number;
  lng: number;
  timestamp: number;
  temp_f: number;
  humidity_pct: number;
  wind_speed_mph: number;
  wind_direction: number;
  precipitation_mm: number;
  feels_like_f: number;
  dew_point_f?: number;
}

export interface ForecastHour {
  time: string; // local ISO like "2026-06-17T06:00"
  hour: number; // local hour 0-23
  dew_point_f: number;
  temp_f: number;
  humidity_pct: number;
  feels_like_f: number;
  precipitation_mm: number;
  wind_speed_mph: number;
  comfort: DewPointComfort;
}

export interface ForecastDay {
  date: string; // "YYYY-MM-DD" local
  hours: ForecastHour[];
  bestWindow: ForecastHour | null;
}
