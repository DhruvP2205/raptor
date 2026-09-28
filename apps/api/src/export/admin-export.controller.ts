import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireSiteAdmin } from '../authz/decorators/require-site-admin.decorator';
import { SiteAdminGuard } from '../authz/guards/site-admin.guard';
import { AdminExportService } from './admin-export.service';
import { streamCsv } from './csv.util';

// D170, docs/design/18-csv-export.md Sections 11-14 — admin tier,
// siteAdmin only, platform-wide/cross-event (no :eventId in these
// routes at all — there's no single event to scope to).
@Controller('admin/export')
@RequireSiteAdmin()
@UseGuards(SiteAdminGuard)
export class AdminExportController {
  constructor(private readonly adminExport: AdminExportService) {}

  @Get('events.csv')
  async allEvents(@CurrentUser() user: User, @Res() res: Response) {
    const { columns, rows } = await this.adminExport.exportAllEvents(user.id);
    streamCsv(res, 'all-events.csv', columns, rows);
  }

  @Get('global-ranking.csv')
  async globalRanking(@CurrentUser() user: User, @Res() res: Response) {
    const { columns, rows } = await this.adminExport.exportGlobalRanking(user.id);
    streamCsv(res, 'global-ranking.csv', columns, rows);
  }

  @Get('audit-log.csv')
  async auditLog(
    @CurrentUser() user: User,
    @Res() res: Response,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
  ) {
    const from = parseOptionalDate(fromRaw, 'from');
    const to = parseOptionalDate(toRaw, 'to');
    const { columns, rows } = await this.adminExport.exportAuditLog(user.id, from, to);
    streamCsv(res, 'audit-log.csv', columns, rows);
  }

  @Get('users.csv')
  async userDirectory(@CurrentUser() user: User, @Res() res: Response) {
    const { columns, rows } = await this.adminExport.exportUserDirectory(user.id);
    streamCsv(res, 'users.csv', columns, rows);
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
