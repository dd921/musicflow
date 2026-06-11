"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Activity, Music } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ConnectButtonProps {
  provider: "strava" | "spotify"
  connected: boolean
}

export function ConnectButton({ provider, connected }: ConnectButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const label = provider === "strava" ? "Strava" : "Spotify"
  const Icon = provider === "strava" ? Activity : Music
  const chipColor =
    provider === "strava"
      ? "border-[#FC4C02]/25 bg-[#FC4C02]/10 text-[#FC4C02]"
      : "border-[#1DB954]/25 bg-[#1DB954]/10 text-[#1DB954]"
  const btnColor =
    provider === "strava"
      ? "bg-[#FC4C02] hover:bg-[#e04402] text-white"
      : "bg-[#1DB954] hover:bg-[#18a348] text-white"

  async function handleDisconnect() {
    setLoading(true)
    const res = await fetch(`/api/${provider}/disconnect`, { method: "POST" })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? `Failed to disconnect ${label}`)
      setLoading(false)
      return
    }
    router.refresh()
    setLoading(false)
  }

  const chip = (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border ${
        connected ? chipColor : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  )

  if (connected) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {chip}
          <div className="min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">Connected</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={loading}
          className="text-muted-foreground hover:text-destructive"
        >
          Disconnect
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {chip}
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">Not connected</p>
        </div>
      </div>
      <Button
        size="sm"
        className={`${btnColor} font-medium`}
        onClick={() => {
          setLoading(true)
          window.location.href = `/api/${provider}/auth`
        }}
        disabled={loading}
      >
        {loading ? "Connecting…" : "Connect"}
      </Button>
    </div>
  )
}
