import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ResultsService } from './results.service';

// Section 6, docs/stages/10-results-and-rankings.md — visibility is
// gated entirely on a LIVE PublishedResultVersion existing, never on
// EventRoleGuard/organizer access or EventPhase. Deliberately a
// separate controller from ResultsController, which is organizer-only
// for every other route under the same events/:eventId/results prefix.
@Controller('events/:eventId')
export class PublicResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get('results')
  @Public()
  getResults(@Param('eventId') eventId: string) {
    return this.results.getPublicResults(eventId);
  }
}
