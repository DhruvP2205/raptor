import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { OrganizerSummaryService } from './organizer-summary.service';

// design/15-organizer-shell.md Section 3 — backs the new Overview
// dashboard. Organizer-only, same guard pattern as every other
// organizer-facing route (siteAdmin bypasses via EventRoleGuard,
// audited); the summary's own `isAdminBypass` field is a separate,
// UI-only signal for the shell's amber banner, not a second
// authorization check.
@Controller('events/:eventId/organizer-summary')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class OrganizerSummaryController {
  constructor(private readonly summary: OrganizerSummaryService) {}

  @Get()
  get(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.summary.getSummary(eventId, user);
  }
}
