import { GithubAuthError, GithubInaccessibleError } from './github-client';

jest.mock('./github-client', () => {
  const actual = jest.requireActual('./github-client');
  return { ...actual, fetchAllCommits: jest.fn() };
});
jest.mock('./token-rotation', () => ({
  pickAvailableToken: jest.fn(),
  recordSuccessfulUse: jest.fn(),
  recordRateLimited: jest.fn(),
  markTokenInvalid: jest.fn(),
}));
jest.mock('@raptor/crypto', () => ({
  decryptGithubToken: jest.fn((enc: string) => `plaintext-${enc}`),
  parseGithubTokenKey: jest.fn(() => Buffer.alloc(32)),
}));

import { fetchAllCommits } from './github-client';
import { markTokenInvalid, pickAvailableToken } from './token-rotation';
import { processVerificationJob } from './processor';

const EVENT = {
  eventStartsAt: new Date('2026-03-01T00:00:00Z'),
  submissionsCloseAt: new Date('2026-03-10T00:00:00Z'),
};

function makePrisma(submission: any) {
  return {
    submission: { findUnique: jest.fn().mockResolvedValue(submission) },
    submissionVerification: { upsert: jest.fn() },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN_KEY = 'a'.repeat(64);
});

describe('processVerificationJob', () => {
  it('does nothing if the submission no longer exists', async () => {
    const prisma = makePrisma(null);
    await processVerificationJob(prisma, 'sub-1');
    expect(prisma.submissionVerification.upsert).not.toHaveBeenCalled();
  });

  it('classifies a non-GitHub repo URL as NON_GITHUB with zero API calls', async () => {
    const prisma = makePrisma({
      id: 'sub-1',
      repoUrl: 'https://gitlab.com/acme/widget',
      event: EVENT,
      verification: null,
    });

    await processVerificationJob(prisma, 'sub-1');

    expect(fetchAllCommits).not.toHaveBeenCalled();
    expect(prisma.submissionVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ checkStatus: 'NON_GITHUB', finalDecision: 'PENDING_REVIEW' }),
      }),
    );
  });

  it('classifies a missing repoUrl as NON_GITHUB', async () => {
    const prisma = makePrisma({ id: 'sub-1', repoUrl: null, event: EVENT, verification: null });
    await processVerificationJob(prisma, 'sub-1');
    expect(prisma.submissionVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ checkStatus: 'NON_GITHUB' }) }),
    );
  });

  it('classifies a private/inaccessible repo as PRIVATE, never auto-disqualified', async () => {
    const prisma = makePrisma({
      id: 'sub-1',
      repoUrl: 'https://github.com/acme/widget',
      event: EVENT,
      verification: null,
    });
    (pickAvailableToken as jest.Mock).mockResolvedValue({ id: 'tok-1', tokenEncrypted: 'enc' });
    (fetchAllCommits as jest.Mock).mockRejectedValue(new GithubInaccessibleError('private'));

    await processVerificationJob(prisma, 'sub-1');

    expect(prisma.submissionVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ checkStatus: 'PRIVATE', finalDecision: 'PENDING_REVIEW' }),
      }),
    );
  });

  it('writes ERROR when no GitHub tokens are available', async () => {
    const prisma = makePrisma({
      id: 'sub-1',
      repoUrl: 'https://github.com/acme/widget',
      event: EVENT,
      verification: null,
    });
    (pickAvailableToken as jest.Mock).mockResolvedValue(null);

    await processVerificationJob(prisma, 'sub-1');

    expect(fetchAllCommits).not.toHaveBeenCalled();
    expect(prisma.submissionVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ checkStatus: 'ERROR' }) }),
    );
  });

  it('rotates to the next token when the first is auth-invalid, and marks it invalid', async () => {
    const prisma = makePrisma({
      id: 'sub-1',
      repoUrl: 'https://github.com/acme/widget',
      event: EVENT,
      verification: null,
    });
    (pickAvailableToken as jest.Mock)
      .mockResolvedValueOnce({ id: 'tok-bad', tokenEncrypted: 'enc-bad' })
      .mockResolvedValueOnce({ id: 'tok-good', tokenEncrypted: 'enc-good' });
    (fetchAllCommits as jest.Mock)
      .mockRejectedValueOnce(new GithubAuthError('bad token'))
      .mockResolvedValueOnce({
        commits: [{ sha: 'a', timestamp: '2026-03-02T00:00:00Z', message: 'm', author: 'a' }],
        rateLimit: { remaining: 100, resetAt: null },
      });

    await processVerificationJob(prisma, 'sub-1');

    expect(markTokenInvalid).toHaveBeenCalledWith(prisma, 'tok-bad');
    expect(fetchAllCommits).toHaveBeenCalledTimes(2);
    expect(prisma.submissionVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ checkStatus: 'VERIFIED', finalDecision: 'APPROVED' }) }),
    );
  });

  it('never overwrites an existing manual finalDecision on re-run, only the evidence', async () => {
    const prisma = makePrisma({
      id: 'sub-1',
      repoUrl: 'https://github.com/acme/widget',
      event: EVENT,
      verification: { reviewedByUserId: 'organizer-1', finalDecision: 'DISQUALIFIED' },
    });
    (pickAvailableToken as jest.Mock).mockResolvedValue({ id: 'tok-1', tokenEncrypted: 'enc' });
    (fetchAllCommits as jest.Mock).mockResolvedValue({
      commits: [{ sha: 'a', timestamp: '2026-03-02T00:00:00Z', message: 'm', author: 'a' }],
      rateLimit: { remaining: 100, resetAt: null },
    });

    await processVerificationJob(prisma, 'sub-1');

    const updateCall = (prisma.submissionVerification.upsert as jest.Mock).mock.calls[0][0];
    expect(updateCall.update).not.toHaveProperty('finalDecision');
    expect(updateCall.update.checkStatus).toBe('VERIFIED');
  });
});
