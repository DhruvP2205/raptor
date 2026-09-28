-- CreateEnum
CREATE TYPE "NormalizationMethod" AS ENUM ('Z_SCORE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "judgeCalibrationMean" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "judgeCalibrationSampleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "judgeCalibrationStdDev" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NormalizationRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "runByUserId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "NormalizationMethod" NOT NULL DEFAULT 'Z_SCORE',
    "minimumN" INTEGER NOT NULL,
    "eventMean" DOUBLE PRECISION NOT NULL,
    "eventStdDev" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "NormalizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedJudgeScore" (
    "id" TEXT NOT NULL,
    "normalizationRunId" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "rawTotal" DOUBLE PRECISION NOT NULL,
    "judgeMeanAtRun" DOUBLE PRECISION NOT NULL,
    "judgeStdDevAtRun" DOUBLE PRECISION NOT NULL,
    "sampleCountAtRun" INTEGER NOT NULL,
    "usedFallback" BOOLEAN NOT NULL,
    "uniformScoringFlagged" BOOLEAN NOT NULL,
    "zScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "NormalizedJudgeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedScore" (
    "id" TEXT NOT NULL,
    "normalizationRunId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "averagedZScore" DOUBLE PRECISION NOT NULL,
    "rescaledValue" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "NormalizedScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedJudgeScore_normalizationRunId_judgeAssignmentId_key" ON "NormalizedJudgeScore"("normalizationRunId", "judgeAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedScore_normalizationRunId_submissionId_key" ON "NormalizedScore"("normalizationRunId", "submissionId");

-- AddForeignKey
ALTER TABLE "NormalizationRun" ADD CONSTRAINT "NormalizationRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizationRun" ADD CONSTRAINT "NormalizationRun_runByUserId_fkey" FOREIGN KEY ("runByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedJudgeScore" ADD CONSTRAINT "NormalizedJudgeScore_normalizationRunId_fkey" FOREIGN KEY ("normalizationRunId") REFERENCES "NormalizationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedJudgeScore" ADD CONSTRAINT "NormalizedJudgeScore_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedScore" ADD CONSTRAINT "NormalizedScore_normalizationRunId_fkey" FOREIGN KEY ("normalizationRunId") REFERENCES "NormalizationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedScore" ADD CONSTRAINT "NormalizedScore_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
