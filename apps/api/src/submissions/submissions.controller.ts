import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { RequireSiteAdmin } from '../authz/decorators/require-site-admin.decorator';
import { SiteAdminGuard } from '../authz/guards/site-admin.guard';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { GalleryRateLimitGuard } from './guards/gallery-rate-limit.guard';
import { SubmissionsService } from './submissions.service';

@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post('events/:eventId/submissions')
  start(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.submissions.startSubmission(eventId, user.id);
  }

  // Static segment, declared ahead of nothing dynamic at this level —
  // there's no GET /events/:eventId/submissions/:id route, so no
  // "mine" vs. wildcard collision is possible, but kept first for
  // readability to match the pattern used elsewhere in this project.
  @Get('events/:eventId/submissions/mine')
  mine(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.submissions.getMine(eventId, user.id);
  }

  // Was organizer-only; opened up per docs/design/05-submission-management.md
  // Section 3 (public gallery) — stages/05-submission-management.md
  // Section 6 explicitly anticipated this exact moment ("Only once the
  // broader gallery-visibility feature is built... the isDraft flag is
  // exactly what that feature will filter on"), so this isn't a
  // loosening of an intentional restriction, it's finishing a
  // deliberately-deferred one. Already only ever returns isDraft:false
  // rows — no new field exposure, just a wider set of allowed callers.
  // Still needs the event's own draft-visibility check (a submission
  // list for a DRAFT event is exactly as sensitive as the event itself)
  // — organizers/admins pass that the same way getEventBySlug's callers
  // do, so this doesn't change their existing view.
  @Get('events/:eventId/submissions')
  @OptionalAuth()
  @UseGuards(GalleryRateLimitGuard)
  listSubmitted(
    @Param('eventId') eventId: string,
    @CurrentUser() user?: User,
    @Query('q') q?: string,
    @Query('trackId') trackId?: string,
  ) {
    return this.submissions.listSubmittedForEvent(
      eventId,
      user ? { id: user.id, siteAdmin: user.siteAdmin } : null,
      { q, trackId },
    );
  }

  @Get('events/:eventId/submissions/drafts')
  @RequireSiteAdmin()
  @UseGuards(SiteAdminGuard)
  listDrafts(@Param('eventId') eventId: string) {
    return this.submissions.listDraftsInProgressForEvent(eventId);
  }

  // Not event-scoped in the URL — the submission id alone is enough to
  // resolve it, same reasoning as Module 4's team routes (D78). The
  // service itself checks owner/organizer/admin visibility (Section 6).
  // OptionalAuth per docs/design/05-submission-management.md Section 4
  // — a submitted (non-draft) submission is public; the service still
  // 404s a draft for anyone but its owner/organizer/admin, same as
  // before, an anonymous caller included.
  @Get('submissions/:id')
  @OptionalAuth()
  @UseGuards(GalleryRateLimitGuard)
  getById(@Param('id') id: string, @CurrentUser() user?: User) {
    return this.submissions.getById(id, user ?? null);
  }

  @Patch('submissions/:id')
  patch(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: UpdateSubmissionDto) {
    return this.submissions.patch(id, user.id, dto);
  }

  @Post('submissions/:id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: User) {
    return this.submissions.submit(id, user.id);
  }

  @Post('submissions/:id/unsubmit')
  unsubmit(@Param('id') id: string, @CurrentUser() user: User) {
    return this.submissions.unsubmit(id, user.id);
  }
}
