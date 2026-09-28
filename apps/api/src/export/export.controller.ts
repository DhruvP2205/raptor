import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { EventRole } from '@prisma/client';
import type { Response } from 'express';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { streamCsv } from './csv.util';
import { ExportService } from './export.service';

// D170/D168, docs/design/18-csv-export.md Section 1 — organizer tier:
// scoped to one event via EventRoleGuard, same as every other
// organizer tool (siteAdmin bypasses, audited). One GET route per
// export, full dump every time, no pagination (Section 1).
@Controller('events/:eventId/export')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class ExportController {
  constructor(private readonly export_: ExportService) {}

  @Get('registrations.csv')
  async registrations(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportRegistrations(eventId);
    streamCsv(res, `registrations-${eventId}.csv`, columns, rows);
  }

  @Get('teams.csv')
  async teams(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportTeams(eventId);
    streamCsv(res, `teams-${eventId}.csv`, columns, rows);
  }

  @Get('judges.csv')
  async judges(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportJudgesAndLoad(eventId);
    streamCsv(res, `judges-${eventId}.csv`, columns, rows);
  }

  // D170's original single export, and the checker's target (Section
  // 2, D168) — route name unchanged from the first version so
  // .dogfood.toml's already-live-verified csv_export path keeps working.
  @Get('submissions.csv')
  async submissions(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportSubmissions(eventId);
    streamCsv(res, `submissions-${eventId}.csv`, columns, rows);
  }

  @Get('scores.csv')
  async scores(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportScores(eventId);
    streamCsv(res, `scores-${eventId}.csv`, columns, rows);
  }

  @Get('normalization-comparison.csv')
  async normalizationComparison(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportNormalizationComparison(eventId);
    streamCsv(res, `normalization-comparison-${eventId}.csv`, columns, rows);
  }

  @Get('voting-results.csv')
  async votingResults(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportVotingResults(eventId);
    streamCsv(res, `voting-results-${eventId}.csv`, columns, rows);
  }

  @Get('certificates.csv')
  async certificates(@Param('eventId') eventId: string, @Res() res: Response) {
    const { columns, rows } = await this.export_.exportCertificates(eventId);
    streamCsv(res, `certificates-${eventId}.csv`, columns, rows);
  }
}
