import { markTokenInvalid, pickAvailableToken, recordRateLimited, recordSuccessfulUse } from './token-rotation';

function makePrisma() {
  return {
    githubToken: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

describe('pickAvailableToken', () => {
  it('picks the token with the most remaining headroom', async () => {
    const prisma = makePrisma();
    prisma.githubToken.findMany.mockResolvedValue([
      { id: 't1', tokenEncrypted: 'enc1', rateLimitRemaining: 50, rateLimitResetAt: null },
      { id: 't2', tokenEncrypted: 'enc2', rateLimitRemaining: 4000, rateLimitResetAt: null },
    ]);

    const result = await pickAvailableToken(prisma, new Set());
    expect(result?.id).toBe('t2');
  });

  it('treats a never-used token (null remaining) as having the most headroom', async () => {
    const prisma = makePrisma();
    prisma.githubToken.findMany.mockResolvedValue([
      { id: 't1', tokenEncrypted: 'enc1', rateLimitRemaining: 50, rateLimitResetAt: null },
      { id: 't2', tokenEncrypted: 'enc2', rateLimitRemaining: null, rateLimitResetAt: null },
    ]);

    const result = await pickAvailableToken(prisma, new Set());
    expect(result?.id).toBe('t2');
  });

  it('skips a token that is rate-limited and not yet past its reset time', async () => {
    const prisma = makePrisma();
    const future = new Date(Date.now() + 60_000);
    prisma.githubToken.findMany.mockResolvedValue([
      { id: 't1', tokenEncrypted: 'enc1', rateLimitRemaining: 0, rateLimitResetAt: future },
      { id: 't2', tokenEncrypted: 'enc2', rateLimitRemaining: 10, rateLimitResetAt: null },
    ]);

    const result = await pickAvailableToken(prisma, new Set());
    expect(result?.id).toBe('t2');
  });

  it('allows a token whose reset time has already passed, even with 0 remaining', async () => {
    const prisma = makePrisma();
    const past = new Date(Date.now() - 60_000);
    prisma.githubToken.findMany.mockResolvedValue([
      { id: 't1', tokenEncrypted: 'enc1', rateLimitRemaining: 0, rateLimitResetAt: past },
    ]);

    const result = await pickAvailableToken(prisma, new Set());
    expect(result?.id).toBe('t1');
  });

  it('excludes ids already tried in this run', async () => {
    const prisma = makePrisma();
    prisma.githubToken.findMany.mockImplementation(({ where }: any) => {
      const excluded = where.id?.notIn ?? [];
      const all = [
        { id: 't1', tokenEncrypted: 'enc1', rateLimitRemaining: 100, rateLimitResetAt: null },
        { id: 't2', tokenEncrypted: 'enc2', rateLimitRemaining: 10, rateLimitResetAt: null },
      ];
      return Promise.resolve(all.filter((t) => !excluded.includes(t.id)));
    });

    const result = await pickAvailableToken(prisma, new Set(['t1']));
    expect(result?.id).toBe('t2');
  });

  it('returns null when every candidate is exhausted, invalid pool, or none exist', async () => {
    const prisma = makePrisma();
    prisma.githubToken.findMany.mockResolvedValue([]);
    const result = await pickAvailableToken(prisma, new Set());
    expect(result).toBeNull();
  });

  it('only queries isValid: true and revokedAt: null tokens', async () => {
    const prisma = makePrisma();
    prisma.githubToken.findMany.mockResolvedValue([]);
    await pickAvailableToken(prisma, new Set());
    expect(prisma.githubToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isValid: true, revokedAt: null }) }),
    );
  });
});

describe('token usage recording', () => {
  it('recordSuccessfulUse persists rate-limit headers and lastUsedAt', async () => {
    const prisma = makePrisma();
    await recordSuccessfulUse(prisma, 't1', { remaining: 42, resetAt: new Date('2026-01-01T00:00:00Z') });
    expect(prisma.githubToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ rateLimitRemaining: 42 }),
    });
  });

  it('recordRateLimited zeroes remaining and stores the reset time', async () => {
    const prisma = makePrisma();
    const resetAt = new Date('2026-01-01T00:00:00Z');
    await recordRateLimited(prisma, 't1', resetAt);
    expect(prisma.githubToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { rateLimitRemaining: 0, rateLimitResetAt: resetAt },
    });
  });

  it('markTokenInvalid flips isValid to false', async () => {
    const prisma = makePrisma();
    prisma.githubToken.update.mockResolvedValue({ id: 't1', label: 'Token A' });
    await markTokenInvalid(prisma, 't1');
    expect(prisma.githubToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { isValid: false },
    });
  });
});
