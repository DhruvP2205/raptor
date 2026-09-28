import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SESSION_COOKIE_NAME, SessionService } from '../session.service';

// Global guard (registered as APP_GUARD in AuthModule) — resolves a
// session cookie to a User on every request, per
// docs/ARCHITECTURE.md Section 6 ("Every session resolves to a User via
// an opaque token lookup (Module 1)"). This carries no role/permission
// logic of its own, deliberately — later modules' event-scoped guards
// (EventRoleGuard, Module 2) build on top of req.user, they don't
// duplicate this resolution step.
//
// Being global means every new route is locked down by default; a
// route has to opt out explicitly with @Public(), rather than every new
// protected route needing someone to remember to add a guard. This is
// the "default closed" posture CLAUDE.md's authorization principle
// calls for, applied one level down from event-role checks.
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const isOptional = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest<Request>();
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken) {
      if (isOptional) return true;
      throw new UnauthorizedException('Not logged in.');
    }

    const session = await this.sessions.resolveByRawToken(rawToken);
    if (!session) {
      if (isOptional) return true;
      throw new UnauthorizedException('Session expired or invalid.');
    }

    req.user = session.user;
    req.session = session;
    return true;
  }
}
