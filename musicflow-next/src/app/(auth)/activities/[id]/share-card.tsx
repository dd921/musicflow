"use client"

import { useRef, useState } from "react"
import { Download } from "lucide-react"
import { toPng } from "html-to-image"

export type ShareCardProps = {
  title: string
  dateLabel: string
  sportType: string
  stats: { label: string; value: string }[]
  tracks: { id: string; name: string; artists: string[]; albumArtSmall: string | null }[]
  units?: string
}

// Sport type → simple emoji/symbol for the hidden card header
const SPORT_ICON: Record<string, string> = {
  Run: "🏃",
  Ride: "🚴",
  Walk: "🚶",
  Hike: "🥾",
  Swim: "🏊",
  Workout: "💪",
  WeightTraining: "🏋️",
  Yoga: "🧘",
  Kayaking: "🛶",
  Skiing: "⛷️",
}

function MusicNotePlaceholder() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: "rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  )
}

function AlbumArt({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) return <MusicNotePlaceholder />

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      width={40}
      height={40}
      onError={() => setFailed(true)}
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  )
}

// The hidden off-screen card that html-to-image captures
function HiddenCard({ title, dateLabel, sportType, stats, tracks }: ShareCardProps) {
  const MAX_TRACKS = 6
  const visibleTracks = tracks.slice(0, MAX_TRACKS)
  const overflow = tracks.length - MAX_TRACKS
  const sportEmoji = SPORT_ICON[sportType] ?? "🏅"

  return (
    <div
      style={{
        position: "fixed",
        left: -99999,
        top: 0,
        width: 1080,
        height: 1350,
        background: "linear-gradient(160deg, #0e0e18 0%, #111120 55%, #0a0a12 100%)",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        color: "#f4f4f8",
        display: "flex",
        flexDirection: "column",
        padding: "72px 72px 60px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Decorative gradient blob */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,107,53,0.14) 0%, rgba(255,107,53,0) 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 440,
          height: 440,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(29,185,84,0.10) 0%, rgba(29,185,84,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Header: sport + title */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,107,53,0.15)",
            border: "1px solid rgba(255,107,53,0.3)",
            borderRadius: 99,
            padding: "6px 18px 6px 12px",
            marginBottom: 28,
          }}
        >
          <span style={{ fontSize: 18 }}>{sportEmoji}</span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#FF6B35",
              fontWeight: 600,
            }}
          >
            {sportType}
          </span>
        </div>

        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            margin: 0,
            marginBottom: 14,
            color: "#ffffff",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            margin: 0,
          }}
        >
          {dateLabel}
        </p>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "linear-gradient(90deg, rgba(255,107,53,0.4) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)",
          margin: "36px 0",
        }}
      />

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`,
          gap: "0 32px",
          marginBottom: 40,
        }}
      >
        {stats.map((stat) => (
          <div key={stat.label}>
            <p
              style={{
                fontFamily: "monospace",
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: 0,
                color: "#ffffff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {stat.value}
            </p>
            <p
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                margin: "6px 0 0",
              }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Soundtrack section */}
      {visibleTracks.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1DB954" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#1DB954",
                fontWeight: 600,
              }}
            >
              Soundtrack
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {visibleTracks.map((track, i) => (
              <div
                key={track.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 12,
                  padding: "10px 16px",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Track number */}
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.3)",
                    width: 20,
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <AlbumArt src={track.albumArtSmall} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#ffffff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {track.name}
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.45)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {track.artists.join(", ")}
                  </p>
                </div>
              </div>
            ))}

            {overflow > 0 && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.3)",
                  textAlign: "center",
                  margin: "4px 0 0",
                }}
              >
                +{overflow} more
              </p>
            )}
          </div>
        </>
      )}

      {/* Footer wordmark */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, #FF6B35 0%, #FF3366 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" fill="white" />
              <circle cx="18" cy="16" r="3" fill="white" />
            </svg>
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            MusicFlow
          </span>
        </div>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.2)",
            textTransform: "uppercase",
          }}
        >
          musicflow.app
        </span>
      </div>
    </div>
  )
}

export function ShareCard(props: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    if (!cardRef.current || loading) return
    setLoading(true)
    setError(null)

    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 1,
        width: 1080,
        height: 1350,
        skipFonts: false,
      })

      const link = document.createElement("a")
      link.download = "activity-share.png"
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error("share card export failed", err)
      setError("Export failed — try again")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Trigger button */}
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={handleDownload}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-colors card-surface text-muted-foreground hover:text-accent disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Download className="size-4" />
          {loading ? "Generating…" : "Share"}
        </button>
        {error && (
          <p className="text-xs text-destructive pl-1">{error}</p>
        )}
      </div>

      {/* Off-screen card node — never display:none so html-to-image can measure it */}
      <div ref={cardRef} aria-hidden="true">
        <HiddenCard {...props} />
      </div>
    </>
  )
}
