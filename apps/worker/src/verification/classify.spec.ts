import { classifyCommits, parseGithubRepoUrl } from './classify';

const WINDOW_START = new Date('2026-03-01T00:00:00Z');
const WINDOW_END = new Date('2026-03-10T00:00:00Z');

function commit(sha: string, timestamp: string) {
  return { sha, timestamp, message: `commit ${sha}`, author: 'someone' };
}

describe('parseGithubRepoUrl', () => {
  it('parses a plain github.com URL', () => {
    expect(parseGithubRepoUrl('https://github.com/acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    });
  });

  it('parses a URL with a trailing slash, .git suffix, or extra path', () => {
    expect(parseGithubRepoUrl('https://github.com/acme/widget/')).toEqual({
      owner: 'acme',
      repo: 'widget',
    });
    expect(parseGithubRepoUrl('https://github.com/acme/widget.git')).toEqual({
      owner: 'acme',
      repo: 'widget',
    });
    expect(parseGithubRepoUrl('https://github.com/acme/widget/tree/main')).toEqual({
      owner: 'acme',
      repo: 'widget',
    });
  });

  it('accepts a URL with no scheme', () => {
    expect(parseGithubRepoUrl('github.com/acme/widget')).toEqual({ owner: 'acme', repo: 'widget' });
  });

  it('rejects non-GitHub hosts (GitLab, Bitbucket, self-hosted)', () => {
    expect(parseGithubRepoUrl('https://gitlab.com/acme/widget')).toBeNull();
    expect(parseGithubRepoUrl('https://bitbucket.org/acme/widget')).toBeNull();
    expect(parseGithubRepoUrl('https://git.internal.corp/acme/widget')).toBeNull();
  });

  it('rejects garbage input without throwing', () => {
    expect(parseGithubRepoUrl('not a url at all')).toBeNull();
    expect(parseGithubRepoUrl('')).toBeNull();
  });
});

describe('classifyCommits', () => {
  it('auto-resolves to VERIFIED/APPROVED when every commit is inside the window', () => {
    const result = classifyCommits(
      [commit('a', '2026-03-02T12:00:00Z'), commit('b', '2026-03-05T12:00:00Z')],
      WINDOW_START,
      WINDOW_END,
    );
    expect(result.checkStatus).toBe('VERIFIED');
    expect(result.finalDecision).toBe('APPROVED');
    expect(result.outsideWindowCommits).toHaveLength(0);
    expect(result.totalCommits).toBe(2);
    expect(result.commitsInWindow).toBe(2);
  });

  it('resolves to SUSPICIOUS/PENDING_REVIEW when some commits are outside the window', () => {
    const result = classifyCommits(
      [commit('a', '2026-03-02T12:00:00Z'), commit('b', '2026-04-01T12:00:00Z')],
      WINDOW_START,
      WINDOW_END,
    );
    expect(result.checkStatus).toBe('SUSPICIOUS');
    expect(result.finalDecision).toBe('PENDING_REVIEW');
    expect(result.outsideWindowCommits).toHaveLength(1);
    expect(result.outsideWindowCommits[0].sha).toBe('b');
  });

  it('resolves to REJECTED/PENDING_REVIEW (never DISQUALIFIED) when every commit is outside the window', () => {
    const result = classifyCommits(
      [commit('a', '2026-01-01T12:00:00Z'), commit('b', '2026-04-01T12:00:00Z')],
      WINDOW_START,
      WINDOW_END,
    );
    expect(result.checkStatus).toBe('REJECTED');
    expect(result.finalDecision).toBe('PENDING_REVIEW');
    expect(result.outsideWindowCommits).toHaveLength(2);
  });

  it('resolves to REJECTED/PENDING_REVIEW when there are zero commits', () => {
    const result = classifyCommits([], WINDOW_START, WINDOW_END);
    expect(result.checkStatus).toBe('REJECTED');
    expect(result.finalDecision).toBe('PENDING_REVIEW');
    expect(result.totalCommits).toBe(0);
  });

  it('normalizes a non-UTC-offset commit timestamp before comparing against the window', () => {
    // 2026-03-02T23:30:00-05:00 is 2026-03-03T04:30:00Z — inside the
    // window. A naive string/date-part comparison that ignored the
    // offset could easily misclassify this.
    const result = classifyCommits(
      [commit('a', '2026-03-02T23:30:00-05:00')],
      WINDOW_START,
      WINDOW_END,
    );
    expect(result.checkStatus).toBe('VERIFIED');
    expect(result.commitsInWindow).toBe(1);
  });

  it('correctly excludes a commit whose UTC-normalized instant falls just outside the window', () => {
    // 2026-02-28T23:00:00-02:00 is 2026-03-01T01:00:00Z — actually
    // inside the window in this case; use an offset that pushes it
    // before windowStart once normalized.
    const result = classifyCommits(
      [commit('a', '2026-02-28T20:00:00-08:00')], // = 2026-03-01T04:00:00Z, inside
      WINDOW_START,
      WINDOW_END,
    );
    expect(result.commitsInWindow).toBe(1);

    const outside = classifyCommits(
      [commit('a', '2026-02-28T10:00:00-08:00')], // = 2026-02-28T18:00:00Z, before windowStart
      WINDOW_START,
      WINDOW_END,
    );
    expect(outside.commitsInWindow).toBe(0);
    expect(outside.checkStatus).toBe('REJECTED');
  });
});
