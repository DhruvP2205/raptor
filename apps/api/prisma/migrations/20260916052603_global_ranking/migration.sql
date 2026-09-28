-- CreateEnum
CREATE TYPE "GlobalAwardKind" AS ENUM ('PODIUM_FIRST', 'PODIUM_SECOND', 'PODIUM_THIRD', 'SPECIAL_AWARD', 'AUDIENCE_CHOICE');

-- AlterTable
ALTER TABLE "Prize" ADD COLUMN     "prizeUsd" INTEGER;

-- CreateTable
CREATE TABLE "GlobalPointsConfig" (
    "id" TEXT NOT NULL,
    "awardKind" "GlobalAwardKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalPointsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalRankingSnapshot" (
    "id" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "triggeredByUserId" TEXT,
    "triggerReason" TEXT,

    CONSTRAINT "GlobalRankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalRankingEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "prizeUsdTotal" INTEGER NOT NULL DEFAULT 0,
    "eventsCount" INTEGER NOT NULL,
    "awardsCount" INTEGER NOT NULL,
    "firstsCount" INTEGER NOT NULL,
    "secondsCount" INTEGER NOT NULL,
    "thirdsCount" INTEGER NOT NULL,
    "firstEventId" TEXT,
    "firstEventDate" TIMESTAMP(3),
    "rank" INTEGER NOT NULL,
    "isTied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GlobalRankingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalRankingAwardDetail" (
    "id" TEXT NOT NULL,
    "globalRankingEntryId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "submissionId" TEXT,
    "awardKind" "GlobalAwardKind" NOT NULL,
    "label" TEXT NOT NULL,
    "teamName" TEXT,
    "projectName" TEXT,
    "finalScore" DOUBLE PRECISION,
    "prizeUsd" INTEGER,
    "pointsAwarded" INTEGER NOT NULL,

    CONSTRAINT "GlobalRankingAwardDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPointsConfig_awardKind_key" ON "GlobalPointsConfig"("awardKind");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalRankingEntry_snapshotId_userId_key" ON "GlobalRankingEntry"("snapshotId", "userId");

-- AddForeignKey
ALTER TABLE "GlobalPointsConfig" ADD CONSTRAINT "GlobalPointsConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalRankingSnapshot" ADD CONSTRAINT "GlobalRankingSnapshot_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalRankingEntry" ADD CONSTRAINT "GlobalRankingEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GlobalRankingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalRankingEntry" ADD CONSTRAINT "GlobalRankingEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalRankingAwardDetail" ADD CONSTRAINT "GlobalRankingAwardDetail_globalRankingEntryId_fkey" FOREIGN KEY ("globalRankingEntryId") REFERENCES "GlobalRankingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalRankingAwardDetail" ADD CONSTRAINT "GlobalRankingAwardDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalRankingAwardDetail" ADD CONSTRAINT "GlobalRankingAwardDetail_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
