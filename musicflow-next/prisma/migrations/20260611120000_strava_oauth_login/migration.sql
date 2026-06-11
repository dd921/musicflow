-- Allow password-less accounts (e.g. users who sign in with Strava)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Track the external provider's account id so returning OAuth logins
-- resolve back to the same user.
ALTER TABLE "Account" ADD COLUMN "providerAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
