import type { Prisma, PrismaClient } from '@prisma/client';
import { decryptGithubToken, parseGithubTokenKey } from '@raptor/crypto';
import { classifyCommits, parseGithubRepoUrl, type CommitClassification, type OutsideWindowCommit } from './classify';
import {
  fetchAllCommits,
  GithubAuthError,
  GithubInaccessibleError,
  GithubRateLimitedError,
} from './github-client';
import { markTokenInvalid, pickAvailableToken, recordRateLimited, recordSuccessfulUse } from './token-rotation';

type TerminalStatus = 'NON_GITHUB' | 'PRIVATE' | 'ERROR';

// Wider than CommitClassification's own checkStatus union — this is
// what actually gets persisted, covering both an automated
// VERIFIED/SUSPICIOUS/REJECTED classification and the three
// stop-before-even-trying statuses (Section 3, step 2-3).
interface EvidenceResult {
  checkStatus: CommitClassification['checkStatus'] | TerminalStatus;
  finalDecision: CommitClassification['finalDecision'];
  firstCommitAt: Date | null;
  lastCommitAt: Date | null;
  totalCommits: number;
  commitsInWindow: number;
  outsideWindowCommits: OutsideWindowCommit[];
}

const TERMINAL_DEFAULTS: Omit<EvidenceResult, 'checkStatus' | 'finalDecision'> = {
  firstCommitAt: null,
  lastCommitAt: null,
  totalCommits: 0,
  commitsInWindow: 0,
  outsideWindowCommits: [],
};

// Module 6 — see docs/stages/06-submission-verification.md Section 3.
// This is the whole per-submission pipeline; the BullMQ worker
// (worker.ts) just calls this once per job with no retry (a failure
// here becomes checkStatus ERROR, which is itself a valid, visible
// terminal state — not a queue-level failure that would trigger a
// retry and violate "always manual, never automatic," D91).
export async function processVerificationJob(prisma: PrismaClient, submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { event: true, verification: true },
  });

  // The submission (or its event) could have been deleted between
  // enqueue and processing — nothing to do, not an error.
  if (!submission) return;

  // Section 7: a re-run must never silently overwrite an existing
  // manual finalDecision. reviewedByUserId is the signal that a human
  // already decided this one — VERIFIED's auto-approval never sets it,
  // only the review endpoint does.
  const hasManualReview = submission.verification?.reviewedByUserId != null;

  if (!submission.repoUrl) {
    await writeTerminal(prisma, submissionId, 'NON_GITHUB', hasManualReview);
    return;
  }

  const parsed = parseGithubRepoUrl(submission.repoUrl);
  if (!parsed) {
    await writeTerminal(prisma, submissionId, 'NON_GITHUB', hasManualReview);
    return;
  }

  const keyHex = process.env.GITHUB_TOKEN_KEY;
  if (!keyHex) {
    console.error('[verification] GITHUB_TOKEN_KEY is not configured — cannot call the GitHub API.');
    await writeTerminal(prisma, submissionId, 'ERROR', hasManualReview);
    return;
  }
  const key = parseGithubTokenKey(keyHex);

  const excluded = new Set<string>();

  for (;;) {
    const candidate = await pickAvailableToken(prisma, excluded);
    if (!candidate) {
      console.error(
        `[verification] No available GitHub tokens for submission ${submissionId} — all exhausted, invalid, or none configured.`,
      );
      await writeTerminal(prisma, submissionId, 'ERROR', hasManualReview);
      return;
    }

    const plaintext = decryptGithubToken(candidate.tokenEncrypted, key);

    try {
      const { commits, rateLimit } = await fetchAllCommits(parsed.owner, parsed.repo, plaintext);
      await recordSuccessfulUse(prisma, candidate.id, rateLimit);

      const classification = classifyCommits(
        commits,
        submission.event.eventStartsAt,
        submission.event.submissionsCloseAt,
      );
      await writeClassification(prisma, submissionId, classification, hasManualReview);
      return;
    } catch (err) {
      if (err instanceof GithubAuthError) {
        await markTokenInvalid(prisma, candidate.id);
        excluded.add(candidate.id);
        continue;
      }
      if (err instanceof GithubRateLimitedError) {
        await recordRateLimited(prisma, candidate.id, err.resetAt);
        excluded.add(candidate.id);
        continue;
      }
      if (err instanceof GithubInaccessibleError) {
        await writeTerminal(prisma, submissionId, 'PRIVATE', hasManualReview);
        return;
      }
      console.error(`[verification] Transient error checking submission ${submissionId}:`, err);
      await writeTerminal(prisma, submissionId, 'ERROR', hasManualReview);
      return;
    }
  }
}

async function writeTerminal(
  prisma: PrismaClient,
  submissionId: string,
  checkStatus: TerminalStatus,
  hasManualReview: boolean,
): Promise<void> {
  await writeClassification(
    prisma,
    submissionId,
    { checkStatus, finalDecision: 'PENDING_REVIEW', ...TERMINAL_DEFAULTS },
    hasManualReview,
  );
}

async function writeClassification(
  prisma: PrismaClient,
  submissionId: string,
  classification: EvidenceResult,
  hasManualReview: boolean,
): Promise<void> {
  const evidence = {
    checkStatus: classification.checkStatus,
    firstCommitAt: classification.firstCommitAt,
    lastCommitAt: classification.lastCommitAt,
    totalCommits: classification.totalCommits,
    commitsInWindow: classification.commitsInWindow,
    outsideWindowCommits: classification.outsideWindowCommits as unknown as Prisma.InputJsonValue,
    checkedAt: new Date(),
  };

  await prisma.submissionVerification.upsert({
    where: { submissionId },
    create: {
      submissionId,
      ...evidence,
      // A fresh row has never been manually reviewed by definition —
      // safe to apply the automated finalDecision outright.
      finalDecision: classification.finalDecision,
    },
    update: {
      ...evidence,
      // Never touch finalDecision/remarks/reviewedBy/reviewedAt once a
      // human has made a call (Section 7) — only refresh the evidence.
      ...(hasManualReview ? {} : { finalDecision: classification.finalDecision }),
    },
  });
}
