-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "weather" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "runEndHour" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "runStartHour" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "SavedLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedLocation_userId_idx" ON "SavedLocation"("userId");

-- AddForeignKey
ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS to match the other tables: the app accesses these via Prisma as the
-- table owner, so RLS with no policies blocks the Supabase Data API entirely.
ALTER TABLE "SavedLocation" ENABLE ROW LEVEL SECURITY;
