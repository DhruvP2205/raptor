/*
  Warnings:

  - Added the required column `judgingClosesAt` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RubricCriterionKind" AS ENUM ('SCORING', 'BONUS', 'SPECIAL_AWARD');

-- AlterTable
-- judgingClosesAt added nullable first, backfilled, then made required —
-- existing rows predate this column and have no natural value for it.
-- Backfilling to resultsAnnounceAt collapses JUDGING_CLOSED to zero
-- width for pre-existing events, which the ordering chain's documented
-- <= (Section 7, docs/stages/08-rubric-and-scoring.md) explicitly
-- allows — never violates eventEndsAt < judgingClosesAt <= resultsAnnounceAt
-- since resultsAnnounceAt was already > eventEndsAt under the old chain.
ALTER TABLE "Event" ADD COLUMN     "finalScoreDisplayScale" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "judgingClosesAt" TIMESTAMP(3);

UPDATE "Event" SET "judgingClosesAt" = "resultsAnnounceAt" WHERE "judgingClosesAt" IS NULL;

ALTER TABLE "Event" ALTER COLUMN "judgingClosesAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "RubricCriterion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "RubricCriterionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weightPercent" INTEGER,
    "maxPoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeReview" (
    "id" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "overallFeedback" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JudgeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreRevision" (
    "id" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "scoresSnapshotJson" JSONB NOT NULL,
    "overallFeedbackSnapshot" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Score_judgeAssignmentId_criterionId_key" ON "Score"("judgeAssignmentId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeReview_judgeAssignmentId_key" ON "JudgeReview"("judgeAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreRevision_judgeAssignmentId_revisionNumber_key" ON "ScoreRevision"("judgeAssignmentId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReview" ADD CONSTRAINT "JudgeReview_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRevision" ADD CONSTRAINT "ScoreRevision_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
