-- CreateEnum
CREATE TYPE "TrackAttachmentMode" AS ENUM ('NONE', 'SINGLE', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('SOLO', 'TEAM');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "trackAttachmentMode" "TrackAttachmentMode" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "demoVideoUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "eventId" TEXT NOT NULL,
ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "liveUrl" TEXT,
ADD COLUMN     "repoUrl" TEXT,
ADD COLUMN     "soloUserId" TEXT,
ADD COLUMN     "submissionType" "SubmissionType" NOT NULL,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ADD COLUMN     "trackIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Submission_eventId_soloUserId_key" ON "Submission"("eventId", "soloUserId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_soloUserId_fkey" FOREIGN KEY ("soloUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

