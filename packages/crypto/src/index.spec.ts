import { randomBytes } from 'node:crypto';
import { decryptGithubToken, encryptGithubToken, parseGithubTokenKey } from './index';

describe('GitHub token AES-256-GCM round trip', () => {
  const key = randomBytes(32);

  it('decrypts back to the original plaintext', () => {
    const plaintext = 'ghp_exampleTokenValue1234567890';
    const encrypted = encryptGithubToken(plaintext, key);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptGithubToken(encrypted, key)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'ghp_sameTokenTwice';
    const first = encryptGithubToken(plaintext, key);
    const second = encryptGithubToken(plaintext, key);
    expect(first).not.toBe(second);
    expect(decryptGithubToken(first, key)).toBe(plaintext);
    expect(decryptGithubToken(second, key)).toBe(plaintext);
  });

  it('fails to decrypt with the wrong key (auth tag mismatch)', () => {
    const encrypted = encryptGithubToken('ghp_secret', key);
    const wrongKey = randomBytes(32);
    expect(() => decryptGithubToken(encrypted, wrongKey)).toThrow();
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(() => parseGithubTokenKey('tooshort')).toThrow(/32 bytes/);
  });

  it('accepts a valid openssl-rand-hex-32 style key', () => {
    const hexKey = randomBytes(32).toString('hex');
    expect(parseGithubTokenKey(hexKey)).toHaveLength(32);
  });
});
