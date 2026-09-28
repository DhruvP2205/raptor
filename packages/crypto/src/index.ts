// Module 6 (Submission Verification) — see
// docs/stages/06-submission-verification.md Section 5 and
// docs/DECISIONS.md D96. A dedicated package (not @raptor/shared,
// which is imported by @raptor/web and must stay browser-safe) because
// @raptor/api and @raptor/worker both need to encrypt/decrypt GitHub
// tokens with the *exact* same algorithm and framing — a hand-copied
// second implementation is exactly the kind of thing CLAUDE.md's
// principle 7 warns can silently drift apart.
//
// Format written to GithubToken.tokenEncrypted: base64(iv[12] +
// authTag[16] + ciphertext). Key comes from the caller (GITHUB_TOKEN_KEY
// env var, itself sourced from a Docker secret — see
// docs/ARCHITECTURE.md Section 5) — never read from the environment
// directly in this package, so it stays a pure function of its inputs
// and is trivially testable without process.env plumbing.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// GITHUB_TOKEN_KEY is a 64-char hex string (32 bytes) — same
// openssl-rand-hex-32 convention as APP_SECRET's .env.example entry.
export function parseGithubTokenKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `GITHUB_TOKEN_KEY must decode to exactly 32 bytes (got ${key.length}) — generate with: openssl rand -hex 32`,
    );
  }
  return key;
}

export function encryptGithubToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptGithubToken(encrypted: string, key: Buffer): string {
  const raw = Buffer.from(encrypted, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
