import type { PrismaClient } from '@prisma/client';
import type { RateLimitInfo } from './github-client';

export interface TokenCandidate {
  id: string;
  tokenEncrypted: string;
}

// Section 5's rotation rule: whichever valid, non-revoked, non-excluded
// token currently has the most remaining rate-limit headroom. A token
// that's never been used (rateLimitRemaining still null) is treated as
// having unknown/maximal headroom, so new tokens get tried before
// assuming an already-characterized token's stated remaining count.
// Exhausted tokens (remaining 0, reset time not yet passed) are
// excluded from consideration entirely, not just deprioritized.
export async function pickAvailableToken(
  prisma: PrismaClient,
  excludeIds: Set<string>,
): Promise<TokenCandidate | null> {
  const now = new Date();
  const candidates = await prisma.githubToken.findMany({
    where: {
      isValid: true,
      revokedAt: null,
      id: excludeIds.size > 0 ? { notIn: [...excludeIds] } : undefined,
    },
  });

  const usable = candidates.filter(
    (t) => t.rateLimitRemaining !== 0 || !t.rateLimitResetAt || t.rateLimitResetAt <= now,
  );

  usable.sort((a, b) => (b.rateLimitRemaining ?? Infinity) - (a.rateLimitRemaining ?? Infinity));

  const best = usable[0];
  return best ? { id: best.id, tokenEncrypted: best.tokenEncrypted } : null;
}

export async function recordSuccessfulUse(
  prisma: PrismaClient,
  tokenId: string,
  rateLimit: RateLimitInfo,
): Promise<void> {
  await prisma.githubToken.update({
    where: { id: tokenId },
    data: {
      rateLimitRemaining: rateLimit.remaining,
      rateLimitResetAt: rateLimit.resetAt,
      lastUsedAt: new Date(),
    },
  });
}

export async function recordRateLimited(
  prisma: PrismaClient,
  tokenId: string,
  resetAt: Date | null,
): Promise<void> {
  await prisma.githubToken.update({
    where: { id: tokenId },
    data: { rateLimitRemaining: 0, rateLimitResetAt: resetAt },
  });
}

// Section 5: "surfaces as a visible admin-dashboard alert, never a
// silent failure." No admin dashboard exists yet in this pass — logging
// loudly is the interim signal; a real alert surface is a follow-up
// once Module 6 has organizer-facing UI, not a silent gap.
export async function markTokenInvalid(prisma: PrismaClient, tokenId: string): Promise<void> {
  const token = await prisma.githubToken.update({
    where: { id: tokenId },
    data: { isValid: false },
  });
  // eslint-disable-next-line no-console
  console.error(
    `[github-tokens] Token "${token.label}" (${token.id}) failed authentication and has been marked invalid.`,
  );
}
