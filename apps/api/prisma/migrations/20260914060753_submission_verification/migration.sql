-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('NOT_RUN', 'VERIFIED', 'SUSPICIOUS', 'REJECTED', 'PRIVATE', 'NON_GITHUB', 'ERROR');

-- CreateEnum
CREATE TYPE "FinalDecision" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'DISQUALIFIED');

-- CreateTable
CREATE TABLE "SubmissionVerification" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "checkStatus" "CheckStatus" NOT NULL DEFAULT 'NOT_RUN',
    "finalDecision" "FinalDecision" NOT NULL DEFAULT 'PENDING_REVIEW',
    "firstCommitAt" TIMESTAMP(3),
    "lastCommitAt" TIMESTAMP(3),
    "totalCommits" INTEGER NOT NULL DEFAULT 0,
    "commitsInWindow" INTEGER NOT NULL DEFAULT 0,
    "outsideWindowCommits" JSONB NOT NULL DEFAULT '[]',
    "finalDecisionRemarks" TEXT,
    "reviewedByUserId" TEXT,
    "checkedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubToken" (
    "id" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitRemaining" INTEGER,
    "rateLimitResetAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionVerification_submissionId_key" ON "SubmissionVerification"("submissionId");

-- AddForeignKey
ALTER TABLE "SubmissionVerification" ADD CONSTRAINT "SubmissionVerification_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionVerification" ADD CONSTRAINT "SubmissionVerification_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
