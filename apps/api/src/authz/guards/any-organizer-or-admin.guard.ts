import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

// Module 9 (Normalization) — see docs/stages/09-normalization.md
// Section 8/11: judge calibration visibility is platform-wide ("any
// organizer/admin," not scoped to one event), consistent with Module
// 7's JudgeReliabilityNote visibility. Every other guard in this
// codebase resolves a role from one specific :eventId
// (EventRoleGuard) — this is the first genuinely cross-event check,
// for the one piece of data this platform deliberately treats as
// platform-wide rather than per-event.
@Injectable()
export class AnyOrganizerOrAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    if (!req.user) {
      throw new UnauthorizedException('Not logged in.');
    }
    if (req.user.siteAdmin) {
      return true;
    }

    const membership = await this.prisma.eventMembership.findFirst({
      where: { userId: req.user.id, role: 'ORGANIZER', invitationStatus: 'ACCEPTED' },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'ORGANIZER_OR_ADMIN_REQUIRED',
        message: 'This action requires organizer access on at least one event, or platform-admin access.',
      });
    }

    return true;
  }
}
