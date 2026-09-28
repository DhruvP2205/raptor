import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// D170, docs/DATA-MODEL.md "Export" — CSV export at every pipeline
// stage (a stated brief requirement, and one of the acceptance
// checker's seven mechanically-checked behaviors at T2). Deliberately
// independent of the Results module's draft/publish pipeline: this
// must return a real CSV at any point in an event's life, not just
// once results have been published, so it computes a simple raw
// average directly from Score rows rather than reusing results'
// weighted finalScore formula (which requires a completed
// NormalizationRun and doesn't exist for most of an event's life).
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportSubmissionsCsv(eventId: string): Promise<string> {
    const submissions = await this.prisma.submission.findMany({
      where: { eventId, everSubmitted: true },
      include: {
        team: { select: { name: true } },
        soloUser: { select: { displayName: true } },
        verification: { select: { finalDecision: true } },
        judgeAssignments: {
          where: { status: 'COMPLETED' },
          include: {
            scores: { include: { criterion: { select: { kind: true } } } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const header = [
      'submissionId',
      'title',
      'submissionType',
      'team',
      'trackIds',
      'verificationDecision',
      'completedReviews',
      'avgRawScore',
    ];

    const rows = submissions.map((s) => {
      const scoringValues = s.judgeAssignments.flatMap((a) =>
        a.scores.filter((sc) => sc.criterion.kind === 'SCORING').map((sc) => sc.value),
      );
      const avgRawScore =
        scoringValues.length > 0
          ? (scoringValues.reduce((sum, v) => sum + v, 0) / scoringValues.length).toFixed(2)
          : '';

      return [
        s.id,
        s.title ?? '',
        s.submissionType,
        s.team?.name ?? s.soloUser?.displayName ?? '',
        s.trackIds.join(';'),
        s.verification?.finalDecision ?? 'PENDING_REVIEW',
        String(s.judgeAssignments.length),
        avgRawScore,
      ];
    });

    return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  }
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
