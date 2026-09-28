-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('MANUAL', 'ALGORITHMIC');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "maxProjectsPerJudge" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "EventMembership" ADD COLUMN     "projectLimitOverride" INTEGER;

-- CreateTable
CREATE TABLE "JudgeAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assignmentMethod" "AssignmentMethod" NOT NULL,
    "transferredFromAssignmentId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JudgeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeReliabilityNote" (
    "id" TEXT NOT NULL,
    "judgeUserId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeReliabilityNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAssignment_transferredFromAssignmentId_key" ON "JudgeAssignment"("transferredFromAssignmentId");

-- CreateIndex
CREATE INDEX "JudgeReliabilityNote_judgeUserId_idx" ON "JudgeReliabilityNote"("judgeUserId");

-- AddForeignKey
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_transferredFromAssignmentId_fkey" FOREIGN KEY ("transferredFromAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReliabilityNote" ADD CONSTRAINT "JudgeReliabilityNote_judgeUserId_fkey" FOREIGN KEY ("judgeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReliabilityNote" ADD CONSTRAINT "JudgeReliabilityNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReliabilityNote" ADD CONSTRAINT "JudgeReliabilityNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
