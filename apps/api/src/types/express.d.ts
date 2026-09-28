import type { Session, User } from '@prisma/client';

// Populated by SessionAuthGuard once a request's session cookie
// resolves to a live (non-revoked, non-expired) Session + User.
declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
    }
  }
}

export {};
