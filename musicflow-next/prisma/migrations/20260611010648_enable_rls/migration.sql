-- Tables live in the exposed "public" schema; the app only accesses them via
-- Prisma as the table owner, so RLS with no policies blocks the Data API entirely.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Track" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
