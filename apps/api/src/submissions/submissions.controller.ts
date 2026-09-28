import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { RequireSiteAdmin } from '../authz/decorators/require-site-admin.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { SiteAdminGuard } from '../authz/guards/site-admin.guard';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
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

  @Get('events/:eventId/submissions')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  listSubmitted(@Param('eventId') eventId: string) {
    return this.submissions.listSubmittedForEvent(eventId);
  }

  @Get('events/:eventId/submissions/drafts')
  @RequireSiteAdmin()
  @UseGuards(SiteAdminGuard)
  listDrafts(@Param('eventId') eventId: string) {
    return this.submissions.listDraftsInProgressForEvent(eventId);
  }

  // Not event-scoped in the URL — the submission id alone is enough to
  // resolve it, same reasoning as Module 4's team routes (D78). The
  // service itself checks owner/organizer/admin visibility (Section 6),
  // since there's no :eventId here for EventRoleGuard to resolve.
  @Get('submissions/:id')
  getById(@Param('id') id: string, @CurrentUser() user: User) {
    return this.submissions.getById(id, user);
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
