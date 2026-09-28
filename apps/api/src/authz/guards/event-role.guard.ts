import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EventRole } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_EVENT_ROLE_KEY } from '../decorators/require-event-role.decorator';

// Resolves :eventId from the request path and checks the current
// user's EventMembership for THAT event only — never a global role
// flag. This is THE authorization path for event-scoped routes; there
// is no parallel "trust the frontend already checked" shortcut. See
// docs/stages/02-roles-and-membership.md Section 4.
@Injectable()
export class EventRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<EventRole>(
      REQUIRE_EVENT_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRole) {
      // A route applied this guard without @RequireEventRole — fail
      // loud, not open. A misconfigured authorization guard silently
      // passing everything through would be a far worse bug than a
      // noisy 500 during development.
      throw new InternalServerErrorException(
        'EventRoleGuard applied without @RequireEventRole.',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('Not logged in.');
    }

    const eventId = req.params?.eventId;
    if (!eventId) {
      throw new InternalServerErrorException(
        'EventRoleGuard applied on a route with no :eventId param.',
      );
    }

    if (req.user.siteAdmin) {
      // The power exists for genuine operational need, but it's never
      // silent — every bypass writes an AuditLog entry naming who, what
      // route, which event, when (Section 4.1).
      await this.audit.record(req.user.id, 'SITE_ADMIN_BYPASS', {
        route: req.route?.path ?? req.path,
        method: req.method,
        eventId,
        requiredRole,
      });
      return true;
    }

    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: req.user.id, eventId } },
    });

    // Only ACCEPTED rows grant any access — a PENDING judge membership
    // must fail this check identically to a non-member (Section 3.2).
    if (
      !membership ||
      membership.role !== requiredRole ||
      membership.invitationStatus !== 'ACCEPTED'
    ) {
      throw new ForbiddenException({
        code: 'EVENT_ROLE_REQUIRED',
        message: `This action requires ${requiredRole} access on this event.`,
      });
    }

    req.eventMembership = membership;
    return true;
  }
}
