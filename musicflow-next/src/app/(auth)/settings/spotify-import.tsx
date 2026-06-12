"use client"

import { useRef, useState } from "react"
import { Upload, CheckCircle2, Loader2 } from "lucide-react"
import { importSpotifyBatch } from "./actions"
import type { ImportEntry } from "./actions"

type State =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "importing"; done: number; total: number }
  | { status: "done"; imported: number; total: number }
  | { status: "error"; message: string }

const BATCH_SIZE = 2000
const CONCURRENCY = 4

async function parseFiles(files: FileList): Promise<ImportEntry[]> {
  const entries: ImportEntry[] = []
  for (let i = 0; i < files.length; i++) {
    try {
      const text = await files[i].text()
      const raw = JSON.parse(text) as unknown[]
      if (!Array.isArray(raw)) continue
      for (const item of raw) {
        const e = item as Record<string, unknown>
        if (
          e.episode_name != null ||
          e.audiobook_title != null ||
          !e.master_metadata_track_name ||
          !e.spotify_track_uri ||
          typeof e.ms_played !== "number" ||
          e.ms_played < 30000
        )
          continue
        const uri = String(e.spotify_track_uri)
        const parts = uri.split(":")
        if (parts.length !== 3 || parts[1] !== "track" || !parts[2]) continue
        entries.push({
          spotifyTrackId: parts[2],
          name: String(e.master_metadata_track_name),
          artists: JSON.stringify([e.master_metadata_album_artist_name ?? "Unknown Artist"]),
          album: String(e.master_metadata_album_album_name ?? ""),
          durationMs: e.ms_played,
          playedAt: String(e.ts),
        })
      }
    } catch {
      // skip malformed files
    }
  }
  return entries
}

export function SpotifyImport() {
  const [state, setState] = useState<State>({ status: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)

  async function run(files: FileList) {
    setState({ status: "parsing" })

    let entries: ImportEntry[]
    try {
      entries = await parseFiles(files)
    } catch {
      setState({ status: "error", message: "Failed to read the selected files." })
      return
    }

    if (entries.length === 0) {
      setState({
        status: "error",
        message:
          "No valid music plays found. Make sure you're uploading Streaming_History_Audio_*.json files.",
      })
      return
    }

    const batches: ImportEntry[][] = []
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      batches.push(entries.slice(i, i + BATCH_SIZE))
    }

    setState({ status: "importing", done: 0, total: entries.length })
    let totalImported = 0
    let done = 0

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const chunk = batches.slice(i, i + CONCURRENCY)
      const results = await Promise.all(chunk.map((b) => importSpotifyBatch(b)))
      totalImported += results.reduce((sum, r) => sum + r.imported, 0)
      done += chunk.reduce((sum, b) => sum + b.length, 0)
      setState({ status: "importing", done, total: entries.length })
    }

    setState({ status: "done", imported: totalImported, total: entries.length })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Listening History Import</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Upload your Spotify Extended Streaming History to match songs to all past workouts, not
          just recent ones.
        </p>
      </div>

      {state.status === "idle" && (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) run(e.target.files)
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
          >
            <Upload className="size-4" />
            Choose JSON files
          </button>
          <p className="text-xs text-muted-foreground">
            Request your data at Spotify → Privacy settings → Download your data. Select all{" "}
            <span className="font-mono text-[0.7rem]">Streaming_History_Audio_*.json</span> files
            from the export.
          </p>
        </div>
      )}

      {state.status === "parsing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Parsing files…
        </div>
      )}

      {state.status === "importing" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Importing {state.done.toLocaleString()} / {state.total.toLocaleString()} plays…
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${Math.round((state.done / state.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 className="size-4" />
          {state.imported.toLocaleString()} new plays imported from {state.total.toLocaleString()}{" "}
          total.
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-400">{state.message}</p>
      )}
    </div>
  )
}
