import { SetMetadata } from '@nestjs/common';

export const OPTIONAL_AUTH_KEY = 'optionalAuth';

// A third mode between @Public() (never resolve a session) and the
// guard's default (require a valid one): resolve req.user if a valid
// session cookie is present, but don't reject the request if it's
// missing or invalid. Needed for routes with genuinely mixed access —
// e.g. GET /events/:slug, which is anonymously readable for a
// PUBLISHED event but needs to know *who's asking* to decide whether a
// non-published one should be visible to them (Section 8,
// docs/stages/03-event-management.md: "DRAFT events are never visible
// ... to anyone without an EventMembership (or siteAdmin)" implies the
// same route serves both cases, not two separate endpoints).
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
