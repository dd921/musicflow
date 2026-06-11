import {
  Bike,
  Dumbbell,
  Flame,
  Footprints,
  Mountain,
  Snowflake,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

const SPORT_ICONS: Record<string, LucideIcon> = {
  Run: Footprints,
  Ride: Bike,
  Swim: Waves,
  Walk: Footprints,
  Hike: Mountain,
  WeightTraining: Dumbbell,
  Workout: Flame,
  Yoga: Flame,
  Skiing: Snowflake,
  Snowboard: Snowflake,
}

export function SportIcon({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  const Icon = SPORT_ICONS[type] ?? Zap
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary",
        className ?? "size-10"
      )}
    >
      <Icon className="size-[45%]" strokeWidth={2} />
    </span>
  )
}
