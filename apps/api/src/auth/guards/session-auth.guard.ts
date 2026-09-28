import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME, SessionService } from '../session.service';

// Resolves a session cookie to a User, per
// docs/ARCHITECTURE.md Section 6 ("Every session resolves to a User via
// an opaque token lookup (Module 1)"). This is the only mechanism later
// modules' event-scoped role guards build on top of — it carries no
// role/permission logic of its own, deliberately, per this stage's
// scope.
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken) {
      throw new UnauthorizedException('Not logged in.');
    }

    const session = await this.sessions.resolveByRawToken(rawToken);
    if (!session) {
      throw new UnauthorizedException('Session expired or invalid.');
    }

    req.user = session.user;
    req.session = session;
    return true;
  }
}
