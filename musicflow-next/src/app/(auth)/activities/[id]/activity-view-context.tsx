"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

type ActivityViewContextValue = {
  hoverSec: number | null
  setHoverSec: (sec: number | null) => void
}

const noop = () => {}

const defaultValue: ActivityViewContextValue = {
  hoverSec: null,
  setHoverSec: noop,
}

const ActivityViewContext = createContext<ActivityViewContextValue>(defaultValue)

export function ActivityViewProvider({ children }: { children: ReactNode }) {
  const [hoverSec, setHoverSec] = useState<number | null>(null)
  return (
    <ActivityViewContext.Provider value={{ hoverSec, setHoverSec }}>
      {children}
    </ActivityViewContext.Provider>
  )
}

// Safe to call outside a provider — returns the no-op default value.
export function useActivityView(): ActivityViewContextValue {
  return useContext(ActivityViewContext)
}
