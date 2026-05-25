"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/activities", label: "Activities", icon: "🏃" },
  { href: "/tracks", label: "Tracks", icon: "🎵" },
  { href: "/insights", label: "Insights", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
]

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-60 glass border-r border-white/5 flex flex-col z-50">
      <div className="p-6">
        <span className="text-2xl font-bold gradient-accent-text">MusicFlow</span>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground truncate">{username}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  )
}
