import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';

// Shared by signup (Module 1) and admin staff-account creation
// (Module 2) — same distinct banned-vs-already-registered errors
// either way, and the same race-recovery path (see D58) re-throws this
// after a lost P2002 race, so both callers need the exact same
// behavior, not just similar-looking code.
export function rejectExistingEmail(user: Pick<User, 'bannedAt'>): never {
  if (user.bannedAt) {
    throw new ForbiddenException({
      code: 'EMAIL_BANNED',
      message: 'This email address is not permitted to register.',
    });
  }
  throw new ConflictException({
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'An account with this email already exists.',
  });
}
