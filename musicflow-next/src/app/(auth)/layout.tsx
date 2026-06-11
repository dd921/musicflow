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
  if (!session?.user) redirect("/")

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
