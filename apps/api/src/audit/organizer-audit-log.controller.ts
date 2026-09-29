import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EventRole } from '@prisma/client';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { OrganizerAuditLogService } from './organizer-audit-log.service';

// Module 24 (Release Closeout, B1) — organizer-only (siteAdmin bypasses
// via EventRoleGuard, audited — same convention as every other
// organizer-tier route this project has). Isolation is the same
// per-resource guard pattern as everywhere else: an organizer of a
// *different* event gets 403 here exactly like any other event-scoped
// route, never a global "is this user an organizer anywhere" check.
@Controller('events/:eventId/audit-log')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class OrganizerAuditLogController {
  constructor(private readonly auditLog: OrganizerAuditLogService) {}

  @Get()
  list(
    @Param('eventId') eventId: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('action') action?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.auditLog.list(eventId, {
      from: parseOptionalDate(fromRaw, 'from'),
      to: parseOptionalDate(toRaw, 'to'),
      action,
      cursor,
    });
  }
}

function parseOptionalDate(raw: string | undefined, paramName: string): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (isNaN(date.getTime())) {
    throw new BadRequestException({ code: 'INVALID_DATE', message: `'${paramName}' is not a valid date.` });
  }
  return date;
}
