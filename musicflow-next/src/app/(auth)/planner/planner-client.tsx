"use client";

import { useEffect, useState } from "react";
import type { ForecastDay } from "@/lib/weather/types";
import type { GeocodeResult } from "@/lib/weather/geocode";
import { selectBestWindow } from "@/lib/weather/forecast";
import { DEW_POINT_BANDS } from "@/lib/weather/dewpoint-score";

type SavedLocation = { id: string; name: string; lat: number; lng: number; timezone: string };

function fmtHour(h: number): string {
  const am = h < 12;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${am ? "am" : "pm"}`;
}

function ComfortLegend() {
  return (
    <div className="card-surface rounded-2xl p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <p className="eyebrow">Run comfort</p>
        <p className="text-[0.7rem] text-muted-foreground/70">
          dew point sets the band; a hot “feels like” bumps it warmer
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {DEW_POINT_BANDS.map((b) => (
          <span key={b.band} className="inline-flex items-center gap-1.5 text-xs">
            <span className={`size-3 rounded ${b.color}`} />
            <span className="text-muted-foreground">{b.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PlannerClient({
  initialLocations,
  initialStartHour,
  initialEndHour,
}: {
  initialLocations: SavedLocation[];
  initialStartHour: number;
  initialEndHour: number;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationId, setLocationId] = useState<string | null>(initialLocations[0]?.id ?? null);
  const [startHour, setStartHour] = useState(initialStartHour);
  const [endHour, setEndHour] = useState(initialEndHour);
  const [days, setDays] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);

  useEffect(() => {
    if (locationId == null) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/forecast?locationId=${locationId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setDays(data.days);
      } catch {
        setError("Could not load the forecast.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [locationId]);

  async function updateHours(start: number, end: number) {
    setStartHour(start);
    setEndHour(end);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_start_hour: start, run_end_hour: end }),
    });
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: search.trim() }),
    });
    if (!res.ok) {
      setCandidates([]);
      return;
    }
    const data = await res.json();
    setCandidates(data.candidates ?? []);
  }

  async function saveLocation(c: GeocodeResult) {
    const label = [c.name, c.admin1, c.country].filter(Boolean).join(", ");
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label, lat: c.lat, lng: c.lng, timezone: c.timezone }),
    });
    if (!res.ok) return;
    const loc = await res.json();
    setLocations((prev) => [...prev, loc]);
    if (locationId == null) setLocationId(loc.id);
    setCandidates([]);
    setSearch("");
  }

  async function removeLocation(id: string) {
    await fetch(`/api/locations/${id}`, { method: "DELETE" });
    setLocations((prev) => prev.filter((l) => l.id !== id));
    if (locationId === id) setLocationId(locations.find((l) => l.id !== id)?.id ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="card-surface rounded-2xl p-4 space-y-3">
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Add a city…"
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium card-surface card-hover">
            Search
          </button>
        </form>
        {candidates.length > 0 && (
          <ul className="space-y-1">
            {candidates.map((c) => (
              <li key={`${c.lat},${c.lng}`}>
                <button
                  onClick={() => saveLocation(c)}
                  className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-white/5"
                >
                  {[c.name, c.admin1, c.country].filter(Boolean).join(", ")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {locations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs">
                {l.name}
                <button onClick={() => removeLocation(l.id)} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {locations.length === 0 ? (
        <p className="text-muted-foreground">Add a location above to see a forecast.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={locationId ?? ""}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Runnable hours:</span>
              <select
                value={startHour}
                onChange={(e) => updateHours(parseInt(e.target.value, 10), endHour)}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1"
              >
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
              <span>to</span>
              <select
                value={endHour}
                onChange={(e) => updateHours(startHour, parseInt(e.target.value, 10))}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1"
              >
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
          </div>

          <ComfortLegend />

          {loading && <p className="text-muted-foreground">Loading forecast…</p>}
          {error && <p className="text-red-400">{error}</p>}

          <div className="space-y-5">
            {days.map((day) => {
              const best = selectBestWindow(day.hours, startHour, endHour);
              return (
              <div key={day.date}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="font-semibold">{day.date}</h3>
                  {best && (
                    <span className="text-sm text-primary">
                      Best: {fmtHour(best.hour)} · {Math.round(best.temp_f)}°F (feels {Math.round(best.feels_like_f)}°) · {Math.round(best.dew_point_f)}° dew · {best.comfort.label}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {day.hours
                    .filter((h) => h.hour >= startHour && h.hour <= endHour)
                    .map((h) => (
                      <div
                        key={h.time}
                        title={`${fmtHour(h.hour)} — ${Math.round(h.temp_f)}°F, feels ${Math.round(h.feels_like_f)}°, dew ${Math.round(h.dew_point_f)}°, ${Math.round(h.humidity_pct)}% RH — ${h.comfort.label}: ${h.comfort.advice}`}
                        className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg text-white ${h.comfort.color}`}
                      >
                        <span className="text-[9px] opacity-80">{fmtHour(h.hour)}</span>
                        <span className="text-[13px] font-semibold leading-none">
                          {Math.round(h.feels_like_f)}°
                        </span>
                        <span className="text-[9px] opacity-80">dew {Math.round(h.dew_point_f)}°</span>
                      </div>
                    ))}
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
