"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function setUnits(units: "metric" | "imperial") {
  if (units !== "metric" && units !== "imperial") {
    throw new Error("Invalid unit system")
  }

  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Not authenticated")
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { units },
  })

  revalidatePath("/", "layout")
}
