import {
  assertNoHashCharacter,
  formatAuthHeadersFile,
  formatHeaderValue,
  parseAuthHeadersFile,
  AuthHeaderRole,
} from './auth-header-bootstrap';
import { generateRawToken } from '../common/crypto.util';

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
