-- CreateEnum
CREATE TYPE "VotingEligibilityMode" AS ENUM ('PARTICIPANTS_ONLY', 'VERIFIED_PLATFORM_USERS');

-- CreateEnum
CREATE TYPE "VotingRoundStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "VoteAbuseFlagStatus" AS ENUM ('PENDING', 'REVIEWED_CLEARED', 'REVIEWED_BANNED');

-- CreateEnum
CREATE TYPE "VotingResultVersionStatus" AS ENUM ('LIVE', 'SUPERSEDED', 'UNPUBLISHED');

-- AlterTable
-- eventClosedAt added nullable first, backfilled, then locked NOT NULL —
-- existing Event rows (from local dev testing, pre-Module-11) have no
-- value for a field this migration is introducing for the first time.
-- Backfilled to 30 days after votingWinnerAnnounceAt, consistent with
-- the ordering chain's votingWinnerAnnounceAt < eventClosedAt rule.
ALTER TABLE "Event" ADD COLUMN     "eventClosedAt" TIMESTAMP(3),
ADD COLUMN     "votingEligibilityMode" "VotingEligibilityMode";

UPDATE "Event" SET "eventClosedAt" = "votingWinnerAnnounceAt" + INTERVAL '30 days' WHERE "eventClosedAt" IS NULL;

ALTER TABLE "Event" ALTER COLUMN "eventClosedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "VotingRound" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "VotingRoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "votingOpensAt" TIMESTAMP(3) NOT NULL,
    "votingClosesAt" TIMESTAMP(3) NOT NULL,
    "votingWinnerAnnounceAt" TIMESTAMP(3) NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" TEXT,
    "deactivationReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VotingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortlistEntry" (
    "id" TEXT NOT NULL,
    "votingRoundId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "isAutoSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "votingRoundId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteAbuseFlag" (
    "id" TEXT NOT NULL,
    "votingRoundId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "implicatedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "VoteAbuseFlagStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteAbuseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingResultVersion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "votingRoundId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "VotingResultVersionStatus" NOT NULL DEFAULT 'LIVE',
    "publishedByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctionReason" TEXT,
    "unpublishReason" TEXT,

    CONSTRAINT "VotingResultVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingResultEntry" (
    "id" TEXT NOT NULL,
    "votingResultVersionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "voteCount" INTEGER NOT NULL,
    "votePercentage" DOUBLE PRECISION NOT NULL,
    "isSharedWin" BOOLEAN NOT NULL DEFAULT false,
    "isDisqualified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VotingResultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VotingRound_eventId_roundNumber_key" ON "VotingRound"("eventId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistEntry_votingRoundId_submissionId_key" ON "ShortlistEntry"("votingRoundId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_votingRoundId_userId_key" ON "Vote"("votingRoundId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteAbuseFlag_votingRoundId_ipHash_key" ON "VoteAbuseFlag"("votingRoundId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "VotingResultVersion_eventId_versionNumber_key" ON "VotingResultVersion"("eventId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VotingResultEntry_votingResultVersionId_submissionId_key" ON "VotingResultEntry"("votingResultVersionId", "submissionId");

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRound" ADD CONSTRAINT "VotingRound_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_votingRoundId_fkey" FOREIGN KEY ("votingRoundId") REFERENCES "VotingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_votingRoundId_fkey" FOREIGN KEY ("votingRoundId") REFERENCES "VotingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteAbuseFlag" ADD CONSTRAINT "VoteAbuseFlag_votingRoundId_fkey" FOREIGN KEY ("votingRoundId") REFERENCES "VotingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteAbuseFlag" ADD CONSTRAINT "VoteAbuseFlag_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingResultVersion" ADD CONSTRAINT "VotingResultVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingResultVersion" ADD CONSTRAINT "VotingResultVersion_votingRoundId_fkey" FOREIGN KEY ("votingRoundId") REFERENCES "VotingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingResultVersion" ADD CONSTRAINT "VotingResultVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingResultEntry" ADD CONSTRAINT "VotingResultEntry_votingResultVersionId_fkey" FOREIGN KEY ("votingResultVersionId") REFERENCES "VotingResultVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingResultEntry" ADD CONSTRAINT "VotingResultEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

