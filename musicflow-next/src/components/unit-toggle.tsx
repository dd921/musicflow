"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { setUnits } from "@/app/(auth)/settings/actions"
import type { UnitSystem } from "@/lib/units"

const OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: "metric", label: "Metric (km)" },
  { value: "imperial", label: "Imperial (mi)" },
]

export function UnitToggle({ current }: { current: UnitSystem }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function select(value: UnitSystem) {
    if (value === current) return
    startTransition(async () => {
      await setUnits(value)
      router.refresh()
    })
  }

  return (
    <div className="card-surface rounded-lg p-1 inline-flex gap-1" role="group">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={isPending}
          aria-pressed={option.value === current}
          onClick={() => select(option.value)}
          className={
            option.value === current
              ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
              : "text-muted-foreground hover:text-foreground px-3 py-1.5 text-sm rounded-md transition-colors"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
