import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CastVoteDto } from './dto/cast-vote.dto';
import { VotingService } from './voting.service';

// Authenticated, but deliberately NOT gated by EventRoleGuard/
// @RequireEventRole — eligibility (PARTICIPANTS_ONLY vs.
// VERIFIED_PLATFORM_USERS, Section 2) is a voting-specific rule, not an
// EventMembership role check, so VotingService.castVote resolves it
// itself. SessionAuthGuard (global) already requires a logged-in user
// before any of these are reached — "always authenticated, no
// anonymous/open-link voting" (Section 2).
@Controller('events/:eventId/voting')
export class VoteCastingController {
  constructor(private readonly voting: VotingService) {}

  @Get('pow-challenge')
  getPowChallenge() {
    return this.voting.issuePowChallenge();
  }

  @Get('captcha-challenge')
  getCaptchaChallenge() {
    return this.voting.issueCaptchaChallenge();
  }

  @Post('votes')
  castVote(@Param('eventId') eventId: string, @CurrentUser() user: User, @Req() req: Request, @Body() dto: CastVoteDto) {
    return this.voting.castVote(eventId, user, req, dto);
  }
}
