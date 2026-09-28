import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { PrismaClient } from '@prisma/client';
import { generateRawToken, sha256Hex } from '../common/crypto.util';
import { SESSION_COOKIE_NAME } from '../auth/session.service';

// D169/D171, docs/design/17-auth-header-bootstrap.md — seed-time
// session credentials for the acceptance checker's four fixture
// identities. Pure formatting/parsing helpers first (unit-tested in
// auth-header-bootstrap.spec.ts without a database), the DB-touching
// orchestrator (issueOrReuseRoleSession) after.

export const AUTH_HEADER_ROLES = ['organizer', 'judge_a', 'judge_b', 'participant'] as const;
export type AuthHeaderRole = (typeof AUTH_HEADER_ROLES)[number];

const ROLE_LABEL_WIDTH = 13; // "participant: ".length — every role's ":" aligns here (Section 3's example)

function padRoleLabel(role: string): string {
  return `${role}:`.padEnd(ROLE_LABEL_WIDTH);
}

// Section 2 — confirmed against the real run.py source: it splits a
// toml value once on the first colon into a header name and value,
// then applies it directly. What we print/persist must therefore be a
// complete header line, never a bare token.
export function formatHeaderValue(rawToken: string): string {
  return `Cookie: ${SESSION_COOKIE_NAME}=${rawToken}`;
}

// Section 4 — a raw '#' would be silently truncated by the checker's
// pre-3.11 Python fallback TOML parser (treated as a comment start).
// generateRawToken()/sha256Hex() are both hex-alphabet by construction
// (0-9a-f) so this can't happen, but Section 6 wants it checked
// directly rather than assumed.
export function assertNoHashCharacter(headerValue: string): void {
  if (headerValue.includes('#')) {
    throw new Error(`Auth header value contains a raw '#', which the checker's TOML parser would truncate: ${headerValue}`);
  }
}

export function formatAuthHeadersFile(headers: Record<AuthHeaderRole, string>): string {
  const lines = AUTH_HEADER_ROLES.map((role) => `${padRoleLabel(role)}${headers[role]}`);
  return [
    '--- dogfood auth headers (copy into .dogfood.toml) ---',
    ...lines,
    '--------------------------------------------------------',
    '',
  ].join('\n');
}

// Inverse of formatAuthHeadersFile — tolerant of the delimiter lines
// and of being handed unrelated surrounding content.
export function parseAuthHeadersFile(content: string): Partial<Record<AuthHeaderRole, string>> {
  const result: Partial<Record<AuthHeaderRole, string>> = {};
  for (const role of AUTH_HEADER_ROLES) {
    const match = content.match(new RegExp(`^${role}:\\s+(.+)$`, 'm'));
    if (match) result[role] = match[1].trim();
  }
  return result;
}

export interface RoleSessionResult {
  role: AuthHeaderRole;
  headerValue: string;
  reused: boolean;
}

// Section 4 — re-running the seed step must not silently rotate these
// four tokens out from under a .dogfood.toml a human already filled
// in. Session only ever stores a hash (never the raw token), so the
// previously-printed file is the sole durable record of the actual
// value across runs — a FixtureImportRecord row alone (fixtureType
// "auth-session", fixtureId = role) can prove a session still exists
// and is still valid, but can never recover what its raw token was.
export async function issueOrReuseRoleSession(
  prisma: PrismaClient,
  role: AuthHeaderRole,
  userId: string,
  previousHeaders: Partial<Record<AuthHeaderRole, string>>,
): Promise<RoleSessionResult> {
  const record = await prisma.fixtureImportRecord.findUnique({
    where: { fixtureType_fixtureId: { fixtureType: 'auth-session', fixtureId: role } },
  });
  if (record) {
    const session = await prisma.session.findUnique({ where: { id: record.internalId } });
    const previousValue = previousHeaders[role];
    const stillValid = !!session && session.expiresAt.getTime() > Date.now();
    if (stillValid && previousValue) {
      return { role, headerValue: previousValue, reused: true };
    }
    // Session gone/expired, or the file didn't have this role's line
    // (e.g. deleted by hand) — fall through and issue a fresh one.
  }

  const rawToken = generateRawToken();
  const tokenHash = sha256Hex(rawToken);
  // Comfortably outlives the 72-hour build window (D166).
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({ data: { userId, tokenHash, expiresAt } });
  await prisma.fixtureImportRecord.upsert({
    where: { fixtureType_fixtureId: { fixtureType: 'auth-session', fixtureId: role } },
    create: { fixtureType: 'auth-session', fixtureId: role, internalId: session.id },
    update: { internalId: session.id },
  });

  const headerValue = formatHeaderValue(rawToken);
  assertNoHashCharacter(headerValue);
  return { role, headerValue, reused: false };
}

// Section 3 — printed to stdout AND persisted to a local, gitignored
// file (.gitignore: apps/api/.fixture-auth-headers.txt), since stdout
// alone means a container restart's output could scroll past before
// anyone reads it, and the file is also the only place a previously
// -issued raw token can be recovered from on a later run (see
// issueOrReuseRoleSession above).
export function readPreviousAuthHeaders(filePath: string): Partial<Record<AuthHeaderRole, string>> {
  if (!existsSync(filePath)) return {};
  return parseAuthHeadersFile(readFileSync(filePath, 'utf8'));
}

export function writeAuthHeadersFile(filePath: string, headers: Record<AuthHeaderRole, string>): void {
  writeFileSync(filePath, formatAuthHeadersFile(headers), 'utf8');
}
