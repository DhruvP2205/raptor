-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('IN_PROGRESS', 'READY');

-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PublishedResultVersionStatus" AS ENUM ('LIVE', 'SUPERSEDED', 'UNPUBLISHED');

-- CreateTable
CREATE TABLE "ResultsDraft" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "normalizationRunId" TEXT NOT NULL,
    "draftStatus" "DraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "publishMode" "PublishMode" NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultsDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedResultVersion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "PublishedResultVersionStatus" NOT NULL DEFAULT 'LIVE',
    "resultsDraftId" TEXT,
    "publishedByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctionReason" TEXT,
    "unpublishReason" TEXT,

    CONSTRAINT "PublishedResultVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankResultEntry" (
    "id" TEXT NOT NULL,
    "publishedResultVersionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "displayScore" DOUBLE PRECISION NOT NULL,
    "isScoreOverridden" BOOLEAN NOT NULL DEFAULT false,
    "isDisqualified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RankResultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialAwardResultEntry" (
    "id" TEXT NOT NULL,
    "publishedResultVersionId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "nominationCount" INTEGER NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SpecialAwardResultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishedResultVersion_eventId_versionNumber_key" ON "PublishedResultVersion"("eventId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RankResultEntry_publishedResultVersionId_submissionId_key" ON "RankResultEntry"("publishedResultVersionId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialAwardResultEntry_publishedResultVersionId_criterionI_key" ON "SpecialAwardResultEntry"("publishedResultVersionId", "criterionId", "submissionId");

-- AddForeignKey
ALTER TABLE "ResultsDraft" ADD CONSTRAINT "ResultsDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultsDraft" ADD CONSTRAINT "ResultsDraft_normalizationRunId_fkey" FOREIGN KEY ("normalizationRunId") REFERENCES "NormalizationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultsDraft" ADD CONSTRAINT "ResultsDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedResultVersion" ADD CONSTRAINT "PublishedResultVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedResultVersion" ADD CONSTRAINT "PublishedResultVersion_resultsDraftId_fkey" FOREIGN KEY ("resultsDraftId") REFERENCES "ResultsDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedResultVersion" ADD CONSTRAINT "PublishedResultVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankResultEntry" ADD CONSTRAINT "RankResultEntry_publishedResultVersionId_fkey" FOREIGN KEY ("publishedResultVersionId") REFERENCES "PublishedResultVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankResultEntry" ADD CONSTRAINT "RankResultEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialAwardResultEntry" ADD CONSTRAINT "SpecialAwardResultEntry_publishedResultVersionId_fkey" FOREIGN KEY ("publishedResultVersionId") REFERENCES "PublishedResultVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialAwardResultEntry" ADD CONSTRAINT "SpecialAwardResultEntry_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialAwardResultEntry" ADD CONSTRAINT "SpecialAwardResultEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
