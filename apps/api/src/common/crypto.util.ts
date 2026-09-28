import { createHash, createHmac, randomBytes } from 'crypto';

// Fast SHA-256, not argon2, for hashing high-entropy random tokens
// (session tokens, email-verification tokens). Argon2 is for low
// -entropy secrets (passwords) where slow hashing resists brute force;
// a 256-bit random token already has enough entropy that a slow hash
// buys nothing and would just make session validation expensive on
// every request.
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Keyed hash for LOW-entropy values (e.g. an IP address — only ~32 bits
// for IPv4). Plain sha256Hex() would be reversible in seconds by just
// hashing every possible input and building a lookup table; HMAC with a
// server-only secret key is what actually makes it one-way in practice.
export function hmacSha256Hex(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function generateRawToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
