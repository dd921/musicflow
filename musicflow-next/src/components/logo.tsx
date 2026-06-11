import { AudioWaveform } from "lucide-react"
import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "gradient-energy inline-flex items-center justify-center rounded-xl text-white shadow-[0_0_20px_rgb(255_107_53/0.35)]",
        className ?? "size-9"
      )}
    >
      <AudioWaveform className="size-[55%]" strokeWidth={2.25} />
    </span>
  )
}

export function Logo({
  markClassName,
  textClassName,
}: {
  markClassName?: string
  textClassName?: string
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      <span
        className={cn(
          "font-bold tracking-tight gradient-brand-text",
          textClassName ?? "text-xl"
        )}
      >
        MusicFlow
      </span>
    </span>
  )
}
