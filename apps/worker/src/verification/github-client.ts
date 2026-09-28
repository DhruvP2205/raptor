import type { RawCommit } from './classify';

// Thrown when the token itself is bad (expired/revoked on GitHub's
// side) — the caller marks the token isValid: false and tries the next
// one (Section 5's validity tracking).
export class GithubAuthError extends Error {}

// Thrown when this specific token is rate-limited right now — the
// caller records the reset time and tries the next token (Section 5's
// rotation).
export class GithubRateLimitedError extends Error {
  constructor(public readonly resetAt: Date | null) {
    super('GitHub API rate limit exhausted for this token.');
  }
}

// Thrown for anything else the API itself reported (403 without a
// rate-limit signal, or 404) — Section 3, step 3: "repo is private/
// inaccessible", never auto-rejected.
export class GithubInaccessibleError extends Error {}

export interface RateLimitInfo {
  remaining: number | null;
  resetAt: Date | null;
}

function parseRateLimit(headers: Headers): RateLimitInfo {
  const remainingHeader = headers.get('x-ratelimit-remaining');
  const resetHeader = headers.get('x-ratelimit-reset');
  return {
    remaining: remainingHeader !== null ? Number(remainingHeader) : null,
    resetAt: resetHeader !== null ? new Date(Number(resetHeader) * 1000) : null,
  };
}

// Hard cap so a pathological/huge repo history can't make a single
// verification job run forever — not specified by the stage doc, a
// judgment call made during implementation (CLAUDE.md: "mark it
// clearly as an assumption"). 100 commits/page x 50 pages = 5,000
// commits, far beyond anything a hackathon submission repo should have.
const MAX_PAGES = 50;
const PER_PAGE = 100;

export async function fetchAllCommits(
  owner: string,
  repo: string,
  token: string,
): Promise<{ commits: RawCommit[]; rateLimit: RateLimitInfo }> {
  const commits: RawCommit[] = [];
  let rateLimit: RateLimitInfo = { remaining: null, resetAt: null };

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${PER_PAGE}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'raptor-verification-worker',
        },
      },
    );

    rateLimit = parseRateLimit(response.headers);

    if (response.status === 401) {
      throw new GithubAuthError('GitHub rejected this token as invalid.');
    }
    if (response.status === 403 && rateLimit.remaining === 0) {
      throw new GithubRateLimitedError(rateLimit.resetAt);
    }
    if (response.status === 403 || response.status === 404) {
      throw new GithubInaccessibleError('Repository is private or inaccessible.');
    }
    if (!response.ok) {
      throw new Error(`GitHub API returned unexpected status ${response.status}.`);
    }

    const body = (await response.json()) as Array<{
      sha: string;
      commit: {
        message: string;
        author: { name: string; date: string } | null;
        committer: { name: string; date: string } | null;
      };
    }>;

    if (body.length === 0) break;

    for (const item of body) {
      const authorInfo = item.commit.author ?? item.commit.committer;
      commits.push({
        sha: item.sha,
        // Author date, not committer date — reflects when the code was
        // actually written, not when it was last rebased/merged.
        timestamp: authorInfo?.date ?? new Date(0).toISOString(),
        message: item.commit.message,
        author: authorInfo?.name ?? 'unknown',
      });
    }

    const linkHeader = response.headers.get('link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) break;
  }

  return { commits, rateLimit };
}
