import { Controller, Get, Param } from '@nestjs/common';
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
}
