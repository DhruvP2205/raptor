import { randomInt } from 'crypto';

// A 6-digit string including leading zeros (000000-999999) — the full
// million-value space "6-digit random" implies, not just 100000-999999.
export function generateSixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
