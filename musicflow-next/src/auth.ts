import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Strava from "next-auth/providers/strava"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/auth.config"
import { resolveStravaUser, type StravaProfile } from "@/lib/strava-auth"

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"]
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        })
        if (!user?.passwordHash) return null

        const valid = await bcryptjs.compare(
          credentials.password as string,
          user.passwordHash
        )
        if (!valid) return null

        return { id: user.id, name: user.username, email: user.email }
      },
    }),
    Strava({
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
      authorization: {
        params: { scope: "read,activity:read_all", approval_prompt: "auto" },
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile }) {
      // On a Strava sign-in, map the athlete to a MusicFlow user (creating one
      // on first login) and persist tokens for the sync engine.
      if (account?.provider === "strava" && profile) {
        token.id = await resolveStravaUser(account, profile as StravaProfile)
      } else if (user) {
        token.id = user.id
      }
      return token
    },
  },
})
