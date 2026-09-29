import {
  assertNoHashCharacter,
  extractRawToken,
  formatAuthHeadersFile,
  formatHeaderValue,
  issueOrReuseRoleSession,
  parseAuthHeadersFile,
  AuthHeaderRole,
} from './auth-header-bootstrap';
import { generateRawToken, sha256Hex } from '../common/crypto.util';

function makePrisma() {
  return {
    fixtureImportRecord: { findUnique: jest.fn(), upsert: jest.fn() },
    session: { findUnique: jest.fn(), create: jest.fn() },
  };
}

describe('formatHeaderValue', () => {
  it('produces a complete header line, not a bare token — Section 2', () => {
    expect(formatHeaderValue('abc123')).toBe('Cookie: raptor_session=abc123');
  });
});

describe('formatAuthHeadersFile / parseAuthHeadersFile round-trip', () => {
  const headers: Record<AuthHeaderRole, string> = {
    organizer: 'Cookie: raptor_session=org-token',
    judge_a: 'Cookie: raptor_session=judge-a-token',
    judge_b: 'Cookie: raptor_session=judge-b-token',
    participant: 'Cookie: raptor_session=participant-token',
  };

  it('matches the doc\'s exact delimited, column-aligned format (Section 3)', () => {
    const content = formatAuthHeadersFile(headers);
    expect(content).toContain('--- dogfood auth headers (copy into .dogfood.toml) ---');
    expect(content).toContain('organizer:   Cookie: raptor_session=org-token');
    expect(content).toContain('judge_a:     Cookie: raptor_session=judge-a-token');
    expect(content).toContain('judge_b:     Cookie: raptor_session=judge-b-token');
    expect(content).toContain('participant: Cookie: raptor_session=participant-token');
  });

  it('round-trips every role back to its original header value', () => {
    const content = formatAuthHeadersFile(headers);
    expect(parseAuthHeadersFile(content)).toEqual(headers);
  });

  it('parses only the roles present, tolerating unrelated surrounding content', () => {
    const partial = parseAuthHeadersFile('some preamble\norganizer:   Cookie: raptor_session=only-this-one\ntrailer');
    expect(partial).toEqual({ organizer: 'Cookie: raptor_session=only-this-one' });
  });

  it('returns an empty object for content with no matching lines', () => {
    expect(parseAuthHeadersFile('nothing relevant here')).toEqual({});
  });
});

describe('assertNoHashCharacter', () => {
  // Section 4/6 — a raw '#' would be silently truncated by the
  // checker's pre-3.11 Python fallback TOML parser.
  it('does not throw for a normal header value', () => {
    expect(() => assertNoHashCharacter('Cookie: raptor_session=abcdef123456')).not.toThrow();
  });

  it('throws if a header value ever contained a raw #', () => {
    expect(() => assertNoHashCharacter('Cookie: raptor_session=abc#def')).toThrow(/raw '#'/);
  });

  it('the real token generator can never actually produce one — hex alphabet only, checked directly rather than assumed', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateRawToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(() => assertNoHashCharacter(formatHeaderValue(token))).not.toThrow();
    }
  });
});

describe('extractRawToken', () => {
  it('recovers the raw token from a well-formed header line', () => {
    expect(extractRawToken('Cookie: raptor_session=abc123')).toBe('abc123');
  });

  it('returns null for anything not matching the expected prefix', () => {
    expect(extractRawToken('abc123')).toBeNull();
    expect(extractRawToken('Cookie: other_cookie=abc123')).toBeNull();
    expect(extractRawToken('')).toBeNull();
  });

  it('returns null for a well-formed prefix with no token', () => {
    expect(extractRawToken('Cookie: raptor_session=')).toBeNull();
  });
});

describe('issueOrReuseRoleSession — reuse must verify the actual token, not just session existence', () => {
  const FUTURE = new Date(Date.now() + 86_400_000);

  it('reuses the file value only when it actually hashes to the live session\'s tokenHash', async () => {
    const prisma = makePrisma();
    const rawToken = 'the-real-current-token';
    prisma.fixtureImportRecord.findUnique.mockResolvedValue({ internalId: 'session-1' });
    prisma.session.findUnique.mockResolvedValue({ id: 'session-1', tokenHash: sha256Hex(rawToken), expiresAt: FUTURE });

    const result = await issueOrReuseRoleSession(prisma as any, 'organizer', 'user-1', {
      organizer: formatHeaderValue(rawToken),
    });

    expect(result).toEqual({ role: 'organizer', headerValue: formatHeaderValue(rawToken), reused: true });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // The real bug, reproduced directly: a valid session exists at the
  // recorded internal id, but the file's token belongs to a DIFFERENT
  // session (e.g. left over from another database sharing the same
  // file path) — must NOT be reported as reused.
  it('issues a fresh session when the file\'s token does not match the live session, even though a valid session exists', async () => {
    const prisma = makePrisma();
    prisma.fixtureImportRecord.findUnique.mockResolvedValue({ internalId: 'session-1' });
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: sha256Hex('the-real-current-token'),
      expiresAt: FUTURE,
    });
    prisma.session.create.mockResolvedValue({ id: 'session-2' });

    const result = await issueOrReuseRoleSession(prisma as any, 'organizer', 'user-1', {
      organizer: formatHeaderValue('a-stale-token-from-a-different-database'),
    });

    expect(result.reused).toBe(false);
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it('issues a fresh session when no FixtureImportRecord exists yet', async () => {
    const prisma = makePrisma();
    prisma.fixtureImportRecord.findUnique.mockResolvedValue(null);
    prisma.session.create.mockResolvedValue({ id: 'session-1' });

    const result = await issueOrReuseRoleSession(prisma as any, 'organizer', 'user-1', {});

    expect(result.reused).toBe(false);
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it('issues a fresh session when the recorded session has expired', async () => {
    const prisma = makePrisma();
    const rawToken = 'an-expired-token';
    prisma.fixtureImportRecord.findUnique.mockResolvedValue({ internalId: 'session-1' });
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.session.create.mockResolvedValue({ id: 'session-2' });

    const result = await issueOrReuseRoleSession(prisma as any, 'organizer', 'user-1', {
      organizer: formatHeaderValue(rawToken),
    });

    expect(result.reused).toBe(false);
  });

  it('issues a fresh session when the file has no line for this role at all', async () => {
    const prisma = makePrisma();
    prisma.fixtureImportRecord.findUnique.mockResolvedValue({ internalId: 'session-1' });
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenHash: sha256Hex('whatever-the-current-token-is'),
      expiresAt: FUTURE,
    });
    prisma.session.create.mockResolvedValue({ id: 'session-2' });

    const result = await issueOrReuseRoleSession(prisma as any, 'organizer', 'user-1', {});

    expect(result.reused).toBe(false);
  });
});
