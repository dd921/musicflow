-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" INTEGER,
    "scope" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotifyTrackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artists" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "albumArt" TEXT,
    "albumArtSmall" TEXT,
    "durationMs" INTEGER NOT NULL,
    "tempo" DOUBLE PRECISION,
    "energy" DOUBLE PRECISION,
    "danceability" DOUBLE PRECISION,
    "valence" DOUBLE PRECISION,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stravaId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "elapsedTime" INTEGER NOT NULL,
    "movingTime" INTEGER NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "averageHeartrate" DOUBLE PRECISION,
    "maxHeartrate" DOUBLE PRECISION,
    "averageSpeed" DOUBLE PRECISION,
    "maxSpeed" DOUBLE PRECISION,
    "totalElevation" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "streams" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_provider_key" ON "Account"("userId", "provider");

-- CreateIndex
CREATE INDEX "Track_userId_playedAt_idx" ON "Track"("userId", "playedAt");

-- CreateIndex
CREATE INDEX "Track_spotifyTrackId_idx" ON "Track"("spotifyTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_userId_spotifyTrackId_playedAt_key" ON "Track"("userId", "spotifyTrackId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_stravaId_key" ON "Activity"("stravaId");

-- CreateIndex
CREATE INDEX "Activity_userId_startDate_idx" ON "Activity"("userId", "startDate");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

