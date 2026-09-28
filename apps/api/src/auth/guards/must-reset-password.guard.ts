import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_WHILE_MUST_RESET_PASSWORD_KEY } from '../decorators/allow-while-must-reset-password.decorator';

// Global guard, registered after SessionAuthGuard so req.user is
// already populated (or absent, for @Public() routes this guard simply
// ignores). Per docs/stages/02-roles-and-membership.md Section 2.3 step
// 5: an admin-created staff account's first login can reach
// POST /auth/set-password and nothing else, until it's called
// successfully.
@Injectable()
export class MustResetPasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // No authenticated user on this request (a @Public() route, or
    // SessionAuthGuard already rejected it) — not this guard's concern.
    if (!req.user || !req.user.mustResetPassword) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHILE_MUST_RESET_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }

    throw new ForbiddenException({
      code: 'MUST_RESET_PASSWORD',
      message: 'You must set a new password before doing anything else.',
    });
  }
}
