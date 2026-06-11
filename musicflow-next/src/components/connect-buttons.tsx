"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ConnectButtonProps {
  provider: "strava" | "spotify"
  connected: boolean
}

export function ConnectButton({ provider, connected }: ConnectButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const label = provider === "strava" ? "Strava" : "Spotify"
  const dotColor = provider === "strava" ? "bg-[#FC4C02]" : "bg-[#1DB954]"
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

  if (connected) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className="text-sm">{label} connected</span>
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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-muted" />
        <span className="text-sm text-muted-foreground">{label} not connected</span>
      </div>
      <Button
        size="sm"
        className={btnColor}
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
