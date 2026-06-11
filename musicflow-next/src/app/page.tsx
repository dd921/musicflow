import Link from "next/link"
import { LoginForm } from "@/components/login-form"
import { LogoMark } from "@/components/logo"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4 py-12">
        <div className="text-center space-y-4 rise-in">
          <LogoMark className="size-14" />
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight gradient-brand-text">
              MusicFlow
            </h1>
            <p className="text-muted-foreground">
              See what you were listening to during your workouts
            </p>
          </div>
        </div>
        <div
          className="card-surface rounded-2xl p-6 sm:p-8 rise-in"
          style={{ animationDelay: "120ms" }}
        >
          <LoginForm />
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-primary hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
