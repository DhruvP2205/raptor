import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { CorrectShortlistEntryDto } from './dto/correct-shortlist-entry.dto';
import { CreateVotingCorrectionDto } from './dto/create-voting-correction.dto';
import { FinalizeShortlistDto } from './dto/finalize-shortlist.dto';
import { PublishVotingResultsDto } from './dto/publish-voting-results.dto';
import { RestartRoundDto } from './dto/restart-round.dto';
import { ReviewAbuseFlagDto } from './dto/review-abuse-flag.dto';
import { SetEligibilityModeDto } from './dto/set-eligibility-mode.dto';
import { UnpublishVotingResultsDto } from './dto/unpublish-voting-results.dto';
import { VotingResultsService } from './voting-results.service';
import { VotingService } from './voting.service';

// Organizer-only throughout (siteAdmin bypasses via EventRoleGuard,
// audited) — every action here is organizer/admin-facing (Section
// 4/5.3/7/9, docs/stages/11-voting.md). Participant-facing actions
// (casting a vote, the PoW/CAPTCHA challenges) live in
// VoteCastingController; the public reveal/results routes live in
// PublicVotingController — same three-way split Module 10 uses between
// ResultsController and PublicResultsController.
@Controller('events/:eventId/voting')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class VotingController {
  constructor(
    private readonly voting: VotingService,
    private readonly results: VotingResultsService,
  ) {}

  @Post('eligibility-mode')
  setEligibilityMode(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: SetEligibilityModeDto) {
    return this.voting.setEligibilityMode(eventId, user.id, dto);
  }

  @Post('rounds')
  createInitialRound(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.voting.createInitialRound(eventId, user.id);
  }

  @Get('rounds')
  listRounds(@Param('eventId') eventId: string) {
    return this.voting.listRounds(eventId);
  }

  @Get('rounds/current')
  getCurrentRound(@Param('eventId') eventId: string) {
    return this.voting.getCurrentRound(eventId);
  }

  @Get('rounds/:roundId/shortlist')
  getShortlistEntries(@Param('eventId') eventId: string, @Param('roundId') roundId: string) {
    return this.voting.getShortlistEntries(eventId, roundId);
  }

  @Post('rounds/restart')
  restartRound(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: RestartRoundDto) {
    return this.voting.restartRound(eventId, user.id, dto);
  }

  @Get('shortlist/suggestions')
  getShortlistSuggestions(@Param('eventId') eventId: string, @Query('normalizationRunId') normalizationRunId?: string) {
    return this.voting.getShortlistSuggestions(eventId, normalizationRunId);
  }

  @Post('rounds/:roundId/shortlist')
  finalizeShortlist(
    @Param('eventId') eventId: string,
    @Param('roundId') roundId: string,
    @CurrentUser() user: User,
    @Body() dto: FinalizeShortlistDto,
  ) {
    return this.voting.finalizeShortlist(eventId, roundId, user.id, dto);
  }

  @Post('rounds/:roundId/shortlist/:entryId/corrections')
  correctShortlistEntry(
    @Param('eventId') eventId: string,
    @Param('roundId') roundId: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: User,
    @Body() dto: CorrectShortlistEntryDto,
  ) {
    return this.voting.correctShortlistEntry(eventId, roundId, entryId, user.id, dto);
  }

  @Get('rounds/:roundId/tally')
  getLiveTally(@Param('eventId') eventId: string, @Param('roundId') roundId: string) {
    return this.voting.getLiveTally(eventId, roundId);
  }

  @Get('abuse-flags')
  listAbuseFlags(@Param('eventId') eventId: string) {
    return this.voting.listAbuseFlags(eventId);
  }

  @Post('abuse-flags/:flagId/review')
  reviewAbuseFlag(
    @Param('eventId') eventId: string,
    @Param('flagId') flagId: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewAbuseFlagDto,
  ) {
    return this.voting.reviewAbuseFlag(eventId, flagId, user.id, dto);
  }

  @Post('results/publish')
  publishResults(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() _dto: PublishVotingResultsDto) {
    return this.results.publish(eventId, user.id);
  }

  @Get('results/versions')
  listVersions(@Param('eventId') eventId: string) {
    return this.results.listVersions(eventId);
  }

  @Get('results/versions/:versionId')
  getVersionDetail(@Param('eventId') eventId: string, @Param('versionId') versionId: string) {
    return this.results.getVersionDetail(eventId, versionId);
  }

  @Post('results/versions/:versionId/unpublish')
  unpublish(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: User,
    @Body() dto: UnpublishVotingResultsDto,
  ) {
    return this.results.unpublish(eventId, versionId, user.id, dto.reason);
  }

  @Post('results/versions/:versionId/corrections')
  createCorrection(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateVotingCorrectionDto,
  ) {
    return this.results.createCorrection(eventId, versionId, user.id, dto);
  }
}
