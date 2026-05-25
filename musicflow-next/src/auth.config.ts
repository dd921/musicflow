import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: { signIn: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl
      const isAuthPage = pathname === "/" || pathname === "/register"
      const isApiAuth = pathname.startsWith("/api/auth")
      const isApiCallback =
        pathname.startsWith("/api/strava/") ||
        pathname.startsWith("/api/spotify/")

      if (isApiAuth || isApiCallback) return true
      if (isLoggedIn && isAuthPage) return Response.redirect(new URL("/dashboard", nextUrl.origin))
      if (!isLoggedIn && !isAuthPage) return Response.redirect(new URL("/", nextUrl.origin))
      return true
    },
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
