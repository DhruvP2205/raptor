import { Controller, Get, Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { VotingResultsService } from './voting-results.service';
import { VotingService } from './voting.service';

// Section 4/8, docs/stages/11-voting.md — shortlist reveal and results
// visibility are gated entirely on PublishedResultVersion/
// VotingResultVersion status, never on organizer access or EventPhase.
// Deliberately a separate controller from VotingController, which is
// organizer-only for every other route under the same
// events/:eventId/voting prefix — same split Module 10 draws between
// ResultsController and PublicResultsController.
@Controller('events/:eventId/voting')
export class PublicVotingController {
  constructor(
    private readonly voting: VotingService,
    private readonly results: VotingResultsService,
  ) {}

  @Get('shortlist')
  @Public()
  getShortlist(@Param('eventId') eventId: string) {
    return this.voting.getPublicShortlist(eventId);
  }

  @Get('results')
  @Public()
  getResults(@Param('eventId') eventId: string) {
    return this.results.getPublicResults(eventId);
  }

  // OptionalAuth, not @Public() — @Public() skips session resolution
  // entirely (req.user is never set, even with a valid cookie), which
  // would make every signed-in visitor look signed-out here. This route
  // genuinely needs "resolve the session if one exists, but don't
  // reject the request if it doesn't" — see VotingService.getMyEligibility's
  // own comment for why the route exists at all.
  @Get('my-eligibility')
  @OptionalAuth()
  getMyEligibility(@Param('eventId') eventId: string, @CurrentUser() user: User | undefined) {
    return this.voting.getMyEligibility(eventId, user ?? null);
  }
}
