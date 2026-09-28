import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SaveDraftDto } from './dto/save-draft.dto';
import { ScoringService } from './scoring.service';

// Judge-owned, not event-scoped by path (Section 4, docs/stages/08-
// rubric-and-scoring.md) — mirrors Module 5's /submissions/:id shape.
// Ownership is checked in the service, not via EventRoleGuard (there's
// no :eventId in this URL for that guard to resolve).
@Controller('assignments')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.scoring.getForScoring(id, user.id);
  }

  @Patch(':id/scores')
  saveDraft(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: SaveDraftDto) {
    return this.scoring.saveDraft(id, user.id, dto);
  }

  @Post(':id/submit-review')
  submitReview(@Param('id') id: string, @CurrentUser() user: User) {
    return this.scoring.submitReview(id, user.id);
  }
}
