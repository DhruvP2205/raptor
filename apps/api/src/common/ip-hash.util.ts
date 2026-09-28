import { Logger } from '@nestjs/common';
import { hmacSha256Hex } from './crypto.util';

const logger = new Logger('ip-hash.util');
let warnedOnce = false;

// Shared by Session.ipHash (Module 1, D58) and Vote.ipHash (Module 11,
// Section 10, docs/stages/11-voting.md) — same one-way construction
// either way (HMAC with a server-only key; a plain hash of an IP
// address is reversible via lookup table given its low entropy), so
// this lives in one place rather than being re-derived per feature
// (CLAUDE.md principle 3). No secret configured -> null rather than a
// hash that only looks safe.
export function hashIpOrNull(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const secret = process.env.APP_SECRET;
  if (!secret) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn(
        'APP_SECRET is not configured — ipHash will be left null rather than hashed with no key.',
      );
    }
    return null;
  }
  return hmacSha256Hex(ip, secret);
}
