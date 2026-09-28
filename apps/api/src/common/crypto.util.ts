import { createHash, randomBytes } from 'crypto';

// Fast SHA-256, not argon2, for hashing high-entropy random tokens
// (session tokens, email-verification tokens). Argon2 is for low
// -entropy secrets (passwords) where slow hashing resists brute force;
// a 256-bit random token already has enough entropy that a slow hash
// buys nothing and would just make session validation expensive on
// every request.
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateRawToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
