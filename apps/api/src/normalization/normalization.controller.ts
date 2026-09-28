import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { NormalizationService } from './normalization.service';

// Organizer-only (siteAdmin bypasses via EventRoleGuard, audited) — the
// window/lock check inside NormalizationService applies uniformly
// regardless of who's calling, including siteAdmin (Section 6,
// docs/stages/09-normalization.md — "no exceptions, no admin override").
@Controller('events/:eventId/normalization-runs')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class NormalizationController {
  constructor(private readonly normalization: NormalizationService) {}

  @Post()
  trigger(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.normalization.triggerRun(eventId, user.id);
  }

  @Get()
  list(@Param('eventId') eventId: string) {
    return this.normalization.list(eventId);
  }

  @Get(':runId')
  getDetail(@Param('eventId') eventId: string, @Param('runId') runId: string) {
    return this.normalization.getDetail(eventId, runId);
  }
}
