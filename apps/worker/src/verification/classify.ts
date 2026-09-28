// Module 6 (Submission Verification) — see
// docs/stages/06-submission-verification.md Section 3. Pure functions,
// no I/O, so the classification rules themselves (D93) are testable
// without a real GitHub call or database.

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
}

// Section 3, step 2: classify the URL before attempting any API call.
// Recognizes github.com URLs only (with or without a scheme, trailing
// slash, trailing .git, or a /tree/branch or /blob/... suffix after
// owner/repo) — anything else is NON_GITHUB, zero API calls attempted.
export function parseGithubRepoUrl(rawUrl: string): ParsedGithubRepo | null {
  let url: URL;
  try {
    url = new URL(
      rawUrl.trim().match(/^https?:\/\//i) ? rawUrl.trim() : `https://${rawUrl.trim()}`,
    );
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== 'github.com') {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

export interface RawCommit {
  sha: string;
  timestamp: string; // ISO 8601, possibly with a non-UTC offset
  message: string;
  author: string;
}

export interface OutsideWindowCommit {
  sha: string;
  timestamp: string;
  message: string;
  author: string;
}

export interface CommitClassification {
  checkStatus: 'VERIFIED' | 'SUSPICIOUS' | 'REJECTED';
  finalDecision: 'APPROVED' | 'PENDING_REVIEW';
  firstCommitAt: Date | null;
  lastCommitAt: Date | null;
  totalCommits: number;
  commitsInWindow: number;
  outsideWindowCommits: OutsideWindowCommit[];
}

// Section 3, steps 4-5. windowStart/windowEnd are eventStartsAt/
// submissionsCloseAt (D92) — never eventEndsAt. Every timestamp is
// compared via Date#getTime() (a real UTC instant), never as a raw
// string, so a commit timestamp expressed with a non-UTC offset is
// still classified correctly — see docs/stages/06-submission-
// verification.md Section 9's explicit test for this.
export function classifyCommits(
  commits: RawCommit[],
  windowStart: Date,
  windowEnd: Date,
): CommitClassification {
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  let firstCommitAt: Date | null = null;
  let lastCommitAt: Date | null = null;
  let commitsInWindow = 0;
  const outsideWindowCommits: OutsideWindowCommit[] = [];

  for (const commit of commits) {
    const commitDate = new Date(commit.timestamp);
    const commitMs = commitDate.getTime();

    if (firstCommitAt === null || commitMs < firstCommitAt.getTime()) {
      firstCommitAt = commitDate;
    }
    if (lastCommitAt === null || commitMs > lastCommitAt.getTime()) {
      lastCommitAt = commitDate;
    }

    if (commitMs >= windowStartMs && commitMs <= windowEndMs) {
      commitsInWindow += 1;
    } else {
      outsideWindowCommits.push({
        sha: commit.sha,
        timestamp: commit.timestamp,
        message: commit.message,
        author: commit.author,
      });
    }
  }

  const totalCommits = commits.length;

  if (totalCommits > 0 && commitsInWindow === totalCommits) {
    return {
      checkStatus: 'VERIFIED',
      finalDecision: 'APPROVED',
      firstCommitAt,
      lastCommitAt,
      totalCommits,
      commitsInWindow,
      outsideWindowCommits,
    };
  }

  if (commitsInWindow > 0) {
    return {
      checkStatus: 'SUSPICIOUS',
      finalDecision: 'PENDING_REVIEW',
      firstCommitAt,
      lastCommitAt,
      totalCommits,
      commitsInWindow,
      outsideWindowCommits,
    };
  }

  // All outside (or zero commits) — REJECTED, but never auto-DISQUALIFIED
  // (D93): GitHub commit timestamps alone aren't conclusive evidence.
  return {
    checkStatus: 'REJECTED',
    finalDecision: 'PENDING_REVIEW',
    firstCommitAt,
    lastCommitAt,
    totalCommits,
    commitsInWindow,
    outsideWindowCommits,
  };
}
