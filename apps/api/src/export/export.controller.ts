import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { EventRole } from '@prisma/client';
import type { Response } from 'express';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { ExportService } from './export.service';

// D170 — organizer-only, one of the acceptance checker's seven
// mechanically-checked behaviors ("organizer can export CSV, expect
// 200 with CSV body"). Same guard pattern as every other organizer
// route (siteAdmin bypasses via EventRoleGuard, audited).
@Controller('events/:eventId/export')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class ExportController {
  constructor(private readonly export_: ExportService) {}

  @Get('submissions.csv')
  async submissionsCsv(@Param('eventId') eventId: string, @Res() res: Response) {
    const csv = await this.export_.exportSubmissionsCsv(eventId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${eventId}.csv"`);
    res.send(csv);
  }
}
