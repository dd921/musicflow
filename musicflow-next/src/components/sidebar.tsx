"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Music,
  Settings,
} from "lucide-react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activities", label: "Activities", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
]

const upcomingItems = [
  { label: "Tracks", icon: Music },
  { label: "Insights", icon: BarChart3 },
]

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-60 glass border-r border-white/5 flex flex-col z-50">
      <div className="p-6">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-white/8 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full gradient-energy" />
              )}
              <item.icon
                className={`size-4 ${active ? "text-primary" : ""}`}
                strokeWidth={2}
              />
              <span>{item.label}</span>
            </Link>
          )
        })}

        <div className="pt-5 pb-1 px-3">
          <span className="eyebrow">Coming soon</span>
        </div>
        {upcomingItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground/50 cursor-default select-none"
          >
            <item.icon className="size-4" strokeWidth={2} />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="size-7 shrink-0 rounded-full gradient-flow flex items-center justify-center text-[0.7rem] font-bold text-black/80 uppercase">
              {username.slice(0, 1)}
            </span>
            <span className="text-sm text-muted-foreground truncate">
              {username}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
