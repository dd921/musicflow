# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js app with Prisma, NextAuth.js credentials auth, Strava/Spotify OAuth, dark-themed UI shell with sidebar navigation, and a placeholder dashboard.

**Architecture:** Next.js 15 App Router with Server Components by default. Prisma ORM connecting to Supabase PostgreSQL. NextAuth.js v5 (beta) for credentials + OAuth token management. shadcn/ui with a custom dark theme.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Prisma, NextAuth.js v5, bcrypt, Supabase PostgreSQL

---

## File Structure

```
musicflow-next/              # New Next.js project (sibling to existing Flask app)
├── .env.local                # Secrets (never committed)
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── components.json           # shadcn/ui config
├── prisma/
│   └── schema.prisma         # Database schema
├── src/
│   ├── auth.ts               # NextAuth.js config
│   ├── middleware.ts          # Auth middleware
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client singleton
│   │   ├── utils.ts          # cn() helper (created by shadcn)
│   │   ├── strava.ts         # Strava OAuth helpers
│   │   └── spotify.ts        # Spotify OAuth helpers
│   ├── app/
│   │   ├── globals.css       # Tailwind + theme CSS variables
│   │   ├── layout.tsx        # Root layout (fonts, body)
│   │   ├── page.tsx          # Landing/login page (public)
│   │   ├── register/
│   │   │   └── page.tsx      # Registration page
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts  # NextAuth route handler
│   │   │   ├── strava/
│   │   │   │   └── callback/route.ts
│   │   │   └── spotify/
│   │   │       └── callback/route.ts
│   │   └── (auth)/
│   │       ├── layout.tsx    # Protected layout with sidebar
│   │       ├── dashboard/
│   │       │   └── page.tsx  # Dashboard placeholder
│   │       └── settings/
│   │           └── page.tsx  # Settings (connected accounts)
│   └── components/
│       ├── ui/               # shadcn/ui components (auto-generated)
│       ├── sidebar.tsx       # Sidebar navigation
│       ├── login-form.tsx    # Login form (client component)
│       └── register-form.tsx # Register form (client component)
```

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `musicflow-next/` (entire project directory)

- [ ] **Step 1: Create Next.js project**

```bash
cd /Users/dandeangelis/projects/musicflow
npx create-next-app@latest musicflow-next --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

When prompted, accept defaults. This creates the full project scaffold.

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm install prisma @prisma/client next-auth@beta bcryptjs @auth/prisma-adapter
npm install -D @types/bcryptjs
```

- [ ] **Step 3: Create `.env.local`**

Create `musicflow-next/.env.local`:

```env
# Auth
AUTH_SECRET=generate-with-openssl-rand-base64-33

# Supabase PostgreSQL
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Strava OAuth
STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret

# Spotify OAuth
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Verify `.gitignore` includes `.env.local`**

Check that `musicflow-next/.gitignore` contains `.env.local` (create-next-app includes it by default). If not, add it.

- [ ] **Step 5: Verify the app starts**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm run dev
```

Expected: Dev server starts on http://localhost:3000. Kill it after confirming.

- [ ] **Step 6: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

### Task 2: Prisma Schema & Database Setup

**Files:**
- Create: `musicflow-next/prisma/schema.prisma`
- Create: `musicflow-next/src/lib/prisma.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npx prisma init
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env` (we already have it in `.env.local`).

- [ ] **Step 2: Write the schema**

Replace the contents of `musicflow-next/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id            String     @id @default(cuid())
  username      String     @unique
  email         String?
  passwordHash  String
  createdAt     DateTime   @default(now())
  accounts      Account[]
  tracks        Track[]
  activities    Activity[]
}

model Account {
  id           String   @id @default(cuid())
  userId       String
  provider     String
  accessToken  String
  refreshToken String?
  expiresAt    Int?
  scope        String?
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
}

model Track {
  id             String   @id @default(cuid())
  userId         String
  spotifyTrackId String
  name           String
  artists        String
  album          String
  albumArt       String?
  albumArtSmall  String?
  durationMs     Int
  tempo          Float?
  energy         Float?
  danceability   Float?
  valence        Float?
  playedAt       DateTime
  storedAt       DateTime @default(now())
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, spotifyTrackId, playedAt])
  @@index([userId, playedAt])
  @@index([spotifyTrackId])
}

model Activity {
  id               String   @id @default(cuid())
  userId           String
  stravaId         BigInt   @unique
  name             String
  type             String
  startDate        DateTime
  elapsedTime      Int
  movingTime       Int
  distance         Float
  averageHeartrate Float?
  maxHeartrate     Float?
  averageSpeed     Float?
  maxSpeed         Float?
  totalElevation   Float?
  calories         Float?
  streams          Json?
  fetchedAt        DateTime @default(now())
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, startDate])
}
```

- [ ] **Step 3: Create Prisma client singleton**

Create `musicflow-next/src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 4: Push schema to database**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npx prisma db push
```

Expected: Schema synced to Supabase. Tables created: User, Account, Track, Activity.

Note: Using `db push` instead of `migrate dev` to avoid shadow database issues with Supabase. For a fresh project this is fine. Switch to `migrate dev` later if needed.

- [ ] **Step 5: Generate Prisma client**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 6: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add prisma/schema.prisma src/lib/prisma.ts
git commit -m "feat: add Prisma schema and database setup"
```

---

### Task 3: shadcn/ui & Dark Theme Setup

**Files:**
- Create: `musicflow-next/components.json`
- Modify: `musicflow-next/src/app/globals.css`
- Modify: `musicflow-next/tailwind.config.ts`
- Modify: `musicflow-next/src/app/layout.tsx`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npx shadcn@latest init
```

When prompted:
- Style: New York
- Base color: Neutral
- CSS variables: Yes

This creates `components.json`, `src/lib/utils.ts`, and modifies `globals.css` and `tailwind.config.ts`.

- [ ] **Step 2: Install core components**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npx shadcn@latest add button card input label skeleton toast sonner dialog separator avatar badge
```

- [ ] **Step 3: Replace globals.css with custom dark theme**

Replace the full contents of `musicflow-next/src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 4%;
    --foreground: 0 0% 95%;

    --card: 0 0% 7%;
    --card-foreground: 0 0% 95%;

    --popover: 0 0% 7%;
    --popover-foreground: 0 0% 95%;

    --primary: 145 65% 42%;
    --primary-foreground: 0 0% 2%;

    --secondary: 0 0% 12%;
    --secondary-foreground: 0 0% 95%;

    --muted: 0 0% 12%;
    --muted-foreground: 0 0% 55%;

    --accent: 24 85% 53%;
    --accent-foreground: 0 0% 2%;

    --destructive: 0 62% 50%;
    --destructive-foreground: 0 0% 95%;

    --border: 0 0% 14%;
    --input: 0 0% 14%;
    --ring: 145 65% 42%;

    --radius: 0.625rem;

    --chart-1: 145 65% 42%;
    --chart-2: 24 85% 53%;
    --chart-3: 330 70% 55%;
    --chart-4: 200 70% 55%;
    --chart-5: 60 70% 50%;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}

@layer utilities {
  .gradient-accent {
    @apply bg-gradient-to-r from-[#1DB954] to-[#FF6B35];
  }

  .gradient-accent-text {
    @apply bg-gradient-to-r from-[#1DB954] to-[#FF6B35] bg-clip-text text-transparent;
  }

  .glass {
    @apply bg-black/40 backdrop-blur-xl border border-white/5;
  }
}
```

- [ ] **Step 4: Update root layout with Inter font and dark class**

Replace `musicflow-next/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "MusicFlow",
  description: "See what you were listening to during your workouts",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Verify the theme works**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm run dev
```

Expected: App loads with dark background (#0A0A0A). Kill after confirming.

- [ ] **Step 6: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add shadcn/ui with custom dark theme"
```

---

### Task 4: NextAuth.js Credentials Authentication

**Files:**
- Create: `musicflow-next/src/auth.ts`
- Create: `musicflow-next/src/app/api/auth/[...nextauth]/route.ts`
- Create: `musicflow-next/src/middleware.ts`
- Create: `musicflow-next/src/app/page.tsx` (login page)
- Create: `musicflow-next/src/app/register/page.tsx`
- Create: `musicflow-next/src/components/login-form.tsx`
- Create: `musicflow-next/src/components/register-form.tsx`

- [ ] **Step 1: Create NextAuth config**

Create `musicflow-next/src/auth.ts`:

```typescript
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const username = credentials.username as string
        const password = credentials.password as string

        const user = await prisma.user.findUnique({
          where: { username },
        })
        if (!user) return null

        const valid = await bcryptjs.compare(password, user.passwordHash)
        if (!valid) return null

        return {
          id: user.id,
          name: user.username,
          email: user.email,
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
```

- [ ] **Step 2: Create NextAuth route handler**

Create `musicflow-next/src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

- [ ] **Step 3: Create auth middleware**

Create `musicflow-next/src/middleware.ts`:

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnAuth = req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/register"
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth")

  // Allow auth API routes always
  if (isApiAuth) return NextResponse.next()

  // Redirect logged-in users away from login/register
  if (isLoggedIn && isOnAuth) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin))
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isOnAuth) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
```

- [ ] **Step 4: Create register API route**

Create `musicflow-next/src/app/api/register/route.ts`:

```typescript
import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const { username, password, email } = await request.json()

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    )
  }

  if (username.length < 3 || password.length < 6) {
    return NextResponse.json(
      { error: "Username must be 3+ chars, password 6+ chars" },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({
    where: { username },
  })

  if (existing) {
    return NextResponse.json(
      { error: "Username already taken" },
      { status: 409 }
    )
  }

  const passwordHash = await bcryptjs.hash(password, 12)

  await prisma.user.create({
    data: {
      username,
      email: email || null,
      passwordHash,
    },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Create login form component**

Create `musicflow-next/src/components/login-form.tsx`:

```tsx
"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError("Invalid username or password")
      setLoading(false)
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" className="w-full gradient-accent" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 6: Create register form component**

Create `musicflow-next/src/components/register-form.tsx`:

```tsx
"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RegisterForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, email }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error)
      setLoading(false)
      return
    }

    // Auto sign in after registration
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError("Registration succeeded but sign-in failed. Please go to login.")
      setLoading(false)
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reg-username">Username</Label>
        <Input
          id="reg-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">Email (optional)</Label>
        <Input
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" className="w-full gradient-accent" disabled={loading}>
        {loading ? "Creating account..." : "Create Account"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 7: Create landing/login page**

Replace `musicflow-next/src/app/page.tsx` with:

```tsx
import Link from "next/link"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold gradient-accent-text">
            MusicFlow
          </h1>
          <p className="text-muted-foreground">
            See what you were listening to during your workouts
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <LoginForm />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create register page**

Create `musicflow-next/src/app/register/page.tsx`:

```tsx
import Link from "next/link"
import { RegisterForm } from "@/components/register-form"

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold gradient-accent-text">
            MusicFlow
          </h1>
          <p className="text-muted-foreground">
            Create your account
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <RegisterForm />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Verify auth flow works**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm run dev
```

Test manually:
1. Visit http://localhost:3000 — should see login page with dark theme and gradient title.
2. Click "Sign up" — should navigate to /register.
3. Register a user — should redirect to /dashboard (will 404, that's expected).
4. Visit http://localhost:3000 — should redirect to /dashboard (already logged in).

- [ ] **Step 10: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add NextAuth.js credentials auth with login/register"
```

---

### Task 5: App Shell — Sidebar & Protected Layout

**Files:**
- Create: `musicflow-next/src/components/sidebar.tsx`
- Create: `musicflow-next/src/app/(auth)/layout.tsx`
- Create: `musicflow-next/src/app/(auth)/dashboard/page.tsx`

- [ ] **Step 1: Create sidebar component**

Create `musicflow-next/src/components/sidebar.tsx`:

```tsx
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
        <h1 className="text-2xl font-bold gradient-accent-text">MusicFlow</h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
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
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground truncate">{username}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-muted-foreground hover:text-foreground"
          >
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create protected layout**

Create `musicflow-next/src/app/(auth)/layout.tsx`:

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/sidebar"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/")
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar username={session.user.name ?? "User"} />
      <main className="flex-1 ml-60 p-8">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard placeholder**

Create `musicflow-next/src/app/(auth)/dashboard/page.tsx`:

```tsx
import { auth } from "@/auth"

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold">
          Welcome back, {session?.user?.name}
        </h2>
        <p className="text-muted-foreground mt-1">
          Connect Strava and Spotify to get started
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Activities", value: "—", icon: "🏃" },
          { label: "Tracks Synced", value: "—", icon: "🎵" },
          { label: "Hours of Music", value: "—", icon: "⏱" },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stat.icon}</span>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-8 text-center">
        <p className="text-muted-foreground">
          Your recent activities will appear here once you connect your accounts.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify the shell works**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm run dev
```

Test: Log in → should see sidebar with navigation + dashboard with stats cards and placeholder. Sidebar should highlight "Dashboard". Sign out button should work.

- [ ] **Step 5: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add sidebar navigation and protected layout"
```

---

### Task 6: Strava OAuth Flow

**Files:**
- Create: `musicflow-next/src/lib/strava.ts`
- Create: `musicflow-next/src/app/api/strava/callback/route.ts`
- Create: `musicflow-next/src/app/api/strava/auth/route.ts`

- [ ] **Step 1: Create Strava OAuth helpers**

Create `musicflow-next/src/lib/strava.ts`:

```typescript
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"

export function getStravaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/strava/callback`,
    scope: "activity:read_all",
    approval_prompt: "auto",
  })
  return `${STRAVA_AUTH_URL}?${params}`
}

export async function exchangeStravaCode(code: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_at: number
  }>
}

export async function refreshStravaToken(refreshToken: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_at: number
  }>
}
```

- [ ] **Step 2: Create Strava auth redirect route**

Create `musicflow-next/src/app/api/strava/auth/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getStravaAuthUrl } from "@/lib/strava"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.redirect(new URL("/"))
  }

  return NextResponse.redirect(getStravaAuthUrl())
}
```

- [ ] **Step 3: Create Strava callback route**

Create `musicflow-next/src/app/api/strava/callback/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { exchangeStravaCode } from "@/lib/strava"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/"))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(
      new URL("/settings?error=strava_denied", request.url)
    )
  }

  const tokens = await exchangeStravaCode(code)

  await prisma.account.upsert({
    where: {
      userId_provider: {
        userId: session.user.id,
        provider: "strava",
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      scope: "activity:read_all",
    },
    create: {
      userId: session.user.id,
      provider: "strava",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      scope: "activity:read_all",
    },
  })

  return NextResponse.redirect(
    new URL("/settings?success=strava_connected", request.url)
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add Strava OAuth flow"
```

---

### Task 7: Spotify OAuth Flow

**Files:**
- Create: `musicflow-next/src/lib/spotify.ts`
- Create: `musicflow-next/src/app/api/spotify/auth/route.ts`
- Create: `musicflow-next/src/app/api/spotify/callback/route.ts`

- [ ] **Step 1: Create Spotify OAuth helpers**

Create `musicflow-next/src/lib/spotify.ts`:

```typescript
const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"

const SPOTIFY_SCOPES = [
  "user-read-recently-played",
  "user-read-playback-state",
  "user-read-currently-playing",
  "playlist-modify-public",
].join(" ")

export function getSpotifyAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/spotify/callback`,
    scope: SPOTIFY_SCOPES,
    show_dialog: "false",
  })
  return `${SPOTIFY_AUTH_URL}?${params}`
}

export async function exchangeSpotifyCode(code: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/spotify/callback`,
    }),
  })

  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }>
}

export async function refreshSpotifyToken(refreshToken: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status}`)
  }

  return res.json() as Promise<{
    access_token: string
    expires_in: number
    refresh_token?: string
  }>
}
```

- [ ] **Step 2: Create Spotify auth redirect route**

Create `musicflow-next/src/app/api/spotify/auth/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSpotifyAuthUrl } from "@/lib/spotify"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.redirect(new URL("/"))
  }

  return NextResponse.redirect(getSpotifyAuthUrl())
}
```

- [ ] **Step 3: Create Spotify callback route**

Create `musicflow-next/src/app/api/spotify/callback/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { exchangeSpotifyCode } from "@/lib/spotify"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/"))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(
      new URL("/settings?error=spotify_denied", request.url)
    )
  }

  const tokens = await exchangeSpotifyCode(code)
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in

  await prisma.account.upsert({
    where: {
      userId_provider: {
        userId: session.user.id,
        provider: "spotify",
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
    },
    create: {
      userId: session.user.id,
      provider: "spotify",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      scope: tokens.scope,
    },
  })

  return NextResponse.redirect(
    new URL("/settings?success=spotify_connected", request.url)
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add Spotify OAuth flow"
```

---

### Task 8: Settings Page — Connected Accounts

**Files:**
- Create: `musicflow-next/src/app/(auth)/settings/page.tsx`
- Create: `musicflow-next/src/components/connect-buttons.tsx`
- Create: `musicflow-next/src/app/api/strava/disconnect/route.ts`
- Create: `musicflow-next/src/app/api/spotify/disconnect/route.ts`

- [ ] **Step 1: Create disconnect routes**

Create `musicflow-next/src/app/api/strava/disconnect/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await prisma.account.deleteMany({
    where: { userId: session.user.id, provider: "strava" },
  })

  return NextResponse.json({ success: true })
}
```

Create `musicflow-next/src/app/api/spotify/disconnect/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await prisma.account.deleteMany({
    where: { userId: session.user.id, provider: "spotify" },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create connect/disconnect buttons component**

Create `musicflow-next/src/components/connect-buttons.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface ConnectButtonsProps {
  provider: "strava" | "spotify"
  connected: boolean
}

export function ConnectButton({ provider, connected }: ConnectButtonsProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const label = provider === "strava" ? "Strava" : "Spotify"
  const color = provider === "strava" ? "bg-[#FC4C02]" : "bg-[#1DB954]"

  async function handleDisconnect() {
    setLoading(true)
    await fetch(`/api/${provider}/disconnect`, { method: "POST" })
    router.refresh()
    setLoading(false)
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
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
        className={`${color} text-white hover:opacity-90`}
        onClick={() => {
          setLoading(true)
          window.location.href = `/api/${provider}/auth`
        }}
        disabled={loading}
      >
        Connect
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Create settings page**

Create `musicflow-next/src/app/(auth)/settings/page.tsx`:

```tsx
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { ConnectButton } from "@/components/connect-buttons"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    select: { provider: true },
  })

  const stravaConnected = accounts.some((a) => a.provider === "strava")
  const spotifyConnected = accounts.some((a) => a.provider === "spotify")

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-3xl font-bold">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your connected accounts and preferences
        </p>
      </div>

      <div className="glass rounded-xl p-6 space-y-6">
        <h3 className="text-lg font-semibold">Connected Accounts</h3>
        <div className="space-y-4">
          <ConnectButton provider="strava" connected={stravaConnected} />
          <ConnectButton provider="spotify" connected={spotifyConnected} />
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold">Profile</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Username</span>
            <span>{session.user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span>—</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify settings page**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm run dev
```

Test: Navigate to Settings via sidebar. Should show Strava/Spotify connect buttons. Clicking "Connect" should redirect to the OAuth provider (will fail if credentials aren't set in `.env.local` yet — that's expected).

- [ ] **Step 5: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add settings page with Strava/Spotify connect/disconnect"
```

---

### Task 9: Token Refresh Helper

**Files:**
- Create: `musicflow-next/src/lib/tokens.ts`

- [ ] **Step 1: Create token manager**

Create `musicflow-next/src/lib/tokens.ts`:

```typescript
import { prisma } from "@/lib/prisma"
import { refreshStravaToken } from "@/lib/strava"
import { refreshSpotifyToken } from "@/lib/spotify"

const TOKEN_BUFFER_SECONDS = 300 // refresh 5 min before expiry

export async function getValidToken(
  userId: string,
  provider: "strava" | "spotify"
): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: {
      userId_provider: { userId, provider },
    },
  })

  if (!account) return null

  const now = Math.floor(Date.now() / 1000)

  // Token still valid
  if (account.expiresAt && account.expiresAt > now + TOKEN_BUFFER_SECONDS) {
    return account.accessToken
  }

  // Need to refresh
  if (!account.refreshToken) return null

  if (provider === "strava") {
    const tokens = await refreshStravaToken(account.refreshToken)
    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at,
      },
    })
    return tokens.access_token
  }

  if (provider === "spotify") {
    const tokens = await refreshSpotifyToken(account.refreshToken)
    const expiresAt = now + tokens.expires_in
    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        expiresAt,
      },
    })
    return tokens.access_token
  }

  return null
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add src/lib/tokens.ts
git commit -m "feat: add token refresh helper for Strava/Spotify"
```

---

### Task 10: Mobile Responsive Bottom Nav

**Files:**
- Create: `musicflow-next/src/components/bottom-nav.tsx`
- Modify: `musicflow-next/src/app/(auth)/layout.tsx`

- [ ] **Step 1: Create bottom nav component**

Create `musicflow-next/src/components/bottom-nav.tsx`:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { href: "/dashboard", label: "Home", icon: "⚡" },
  { href: "/activities", label: "Activities", icon: "🏃" },
  { href: "/tracks", label: "Tracks", icon: "🎵" },
  { href: "/insights", label: "Insights", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 md:hidden z-50">
      <div className="flex justify-around py-2">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Update auth layout for responsive nav**

Replace `musicflow-next/src/app/(auth)/layout.tsx` with:

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { BottomNav } from "@/components/bottom-nav"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/")
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden md:block">
        <Sidebar username={session.user.name ?? "User"} />
      </div>
      <main className="flex-1 md:ml-60 p-4 md:p-8 pb-20 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 3: Verify responsive layout**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
npm run dev
```

Test: Resize browser below 768px — sidebar should hide, bottom nav should appear. Above 768px — sidebar visible, bottom nav hidden.

- [ ] **Step 4: Commit**

```bash
cd /Users/dandeangelis/projects/musicflow/musicflow-next
git add -A
git commit -m "feat: add responsive bottom nav for mobile"
```

---

## Phase 1 Completion Checklist

After all tasks are done, verify:

- [ ] `npm run build` completes without errors
- [ ] Login → Register → Dashboard flow works
- [ ] Sidebar navigation works on desktop
- [ ] Bottom nav works on mobile
- [ ] Settings page shows connect/disconnect buttons
- [ ] Dark theme with gradient accents renders correctly
- [ ] Prisma schema is synced to Supabase

Phase 2 (Strava/Spotify sync, activity detail with charts) will be planned separately after Phase 1 is complete.
