import { Controller, Get, Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ScoringService } from './scoring.service';

// Module 19 (docs/design/19-dogfood-toml.md) — the peer_scores-shaped
// route. Not nested under /events/:eventId (no EventRoleGuard to
// apply here); ownership/organizer-or-self is checked inside
// ScoringService.getForAudit, same "resolve, then authorize in the
// service" pattern ScoringController already uses for /assignments/:id.
@Controller('submissions/:submissionId/judges')
export class AuditScoringController {
  constructor(private readonly scoring: ScoringService) {}

  @Get(':judgeId/scores')
  getForAudit(
    @Param('submissionId') submissionId: string,
    @Param('judgeId') judgeId: string,
    @CurrentUser() user: User,
  ) {
    return this.scoring.getForAudit(submissionId, judgeId, { id: user.id, siteAdmin: user.siteAdmin });
  }
}
