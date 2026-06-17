import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlannerClient } from "./planner-client";

export default async function PlannerPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [locations, user] = await Promise.all([
    prisma.savedLocation.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { runStartHour: true, runEndHour: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="rise-in">
        <p className="eyebrow mb-2">Weather</p>
        <h2 className="text-3xl font-bold tracking-tight">Run Planner</h2>
        <p className="text-muted-foreground mt-1">Best times to run, by dew point.</p>
      </div>
      <PlannerClient
        initialLocations={locations}
        initialStartHour={user?.runStartHour ?? 5}
        initialEndHour={user?.runEndHour ?? 21}
      />
    </div>
  );
}
