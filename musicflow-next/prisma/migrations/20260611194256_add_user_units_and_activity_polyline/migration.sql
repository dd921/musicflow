-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "summaryPolyline" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "units" TEXT NOT NULL DEFAULT 'metric';
