import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UnpublishDto } from './dto/unpublish.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import type { PublishDraftDto } from './dto/publish-draft.dto';
import { ResultsService } from './results.service';

// Organizer-only throughout (siteAdmin bypasses via EventRoleGuard,
// audited) — every action here is organizer/admin-facing (Section 5/7,
// docs/stages/10-results-and-rankings.md). The one participant-facing
// route lives in PublicResultsController instead, since it must never
// require organizer access.
@Controller('events/:eventId/results')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Post('drafts')
  createDraft(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: CreateDraftDto) {
    return this.results.createDraft(eventId, user.id, dto);
  }

  @Get('drafts')
  listDrafts(@Param('eventId') eventId: string) {
    return this.results.listDrafts(eventId);
  }

  @Patch('drafts/:draftId')
  updateDraft(
    @Param('eventId') eventId: string,
    @Param('draftId') draftId: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.results.updateDraft(eventId, draftId, dto);
  }

  @Get('drafts/:draftId/preview')
  previewDraft(@Param('eventId') eventId: string, @Param('draftId') draftId: string) {
    return this.results.previewDraft(eventId, draftId);
  }

  // PublishDraftDto's only job is validating the required confirm:true
  // flag (Section 5.2) — the service itself needs nothing from the
  // body beyond that having passed validation.
  @Post('drafts/:draftId/publish')
  publishDraft(
    @Param('eventId') eventId: string,
    @Param('draftId') draftId: string,
    @CurrentUser() user: User,
    @Body() _dto: PublishDraftDto,
  ) {
    return this.results.publishDraft(eventId, draftId, user.id);
  }

  @Get('versions')
  listVersions(@Param('eventId') eventId: string) {
    return this.results.listVersions(eventId);
  }

  @Get('versions/:versionId')
  getVersionDetail(@Param('eventId') eventId: string, @Param('versionId') versionId: string) {
    return this.results.getVersionDetail(eventId, versionId);
  }

  @Post('versions/:versionId/unpublish')
  unpublish(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: User,
    @Body() dto: UnpublishDto,
  ) {
    return this.results.unpublish(eventId, versionId, user.id, dto.reason);
  }

  @Post('versions/:versionId/corrections')
  createCorrection(
    @Param('eventId') eventId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateCorrectionDto,
  ) {
    return this.results.createCorrection(eventId, versionId, user.id, dto);
  }
}
