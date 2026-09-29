import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PlatformStats {
  eventsCount: number;
  submissionsCount: number;
  participantsCount: number;
}

// docs/design/home-page.md Section 2.2 — the stat strip's real
// platform-wide totals, not per-event numbers. "Countries" from the
// original mega-doc component table was dropped (no field anywhere in
// this schema captures a user's country — adding one is a real feature
// with its own privacy/onboarding implications, not a stat-strip
// add-on) — three honest numbers instead of four with one guessed.
@Injectable()
export class PlatformStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<PlatformStats> {
    const [eventsCount, submissionsCount, participantsCount] = await Promise.all([
      this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.submission.count({ where: { isDraft: false } }),
      this.prisma.eventMembership.findMany({
        where: { role: 'PARTICIPANT', invitationStatus: 'ACCEPTED' },
        distinct: ['userId'],
        select: { userId: true },
      }).then((rows) => rows.length),
    ]);

    return { eventsCount, submissionsCount, participantsCount };
  }
}
