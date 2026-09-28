// Shared by every page that honors a `next` query param (login,
// set-password) so this security-sensitive check has exactly one
// implementation, not one per call site that could drift.
//
// Only a same-origin, single-leading-slash path is ever honored.
// Rejecting a literal `//`/`\` prefix isn't enough on its own — the
// WHATWG URL parser treats backslashes as path separators for special
// schemes, so `/\evil.com` (or `/\\evil.com`, etc.) can resolve to
// `http://evil.com/` even though it "looks" like a relative path
// (verified: `new URL('/\\evil.com', origin).href` === `http://evil.com/`).
// Parsing it and checking the resolved origin closes that gap instead
// of trying to enumerate every string that could confuse a URL parser.
//
// Uses a fixed placeholder base (not `window.location.origin`) so this
// stays safe to call during SSR, where `window` doesn't exist — the
// actual base value doesn't matter, only whether parsing `next` against
// it stays on that same base or escapes to a different host.
const PLACEHOLDER_BASE = 'http://raptor.invalid';

export function safeReturnPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  let resolved: URL;
  try {
    resolved = new URL(next, PLACEHOLDER_BASE);
  } catch {
    return null;
  }
  if (resolved.origin !== PLACEHOLDER_BASE) return null;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
