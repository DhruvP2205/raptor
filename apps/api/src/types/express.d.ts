import type { EventMembership, Session, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      // Populated by SessionAuthGuard once a request's session cookie
      // resolves to a live (non-revoked, non-expired) Session + User.
      user?: User;
      session?: Session;
      // Populated by EventRoleGuard once it's confirmed the caller has
      // the required role on :eventId — saves handlers a redundant
      // lookup for anything beyond the bare pass/fail the guard did.
      eventMembership?: EventMembership;
    }
  }
}

export {};
