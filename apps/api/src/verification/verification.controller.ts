import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { TriggerVerificationDto } from './dto/trigger-verification.dto';
import { VerificationService } from './verification.service';

// Organizer-only (siteAdmin bypasses via EventRoleGuard itself, audited)
// — Section 7's controls are entirely organizer/admin-facing, never
// exposed to participants or judges.
@Controller('events/:eventId/verifications')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post('run')
  triggerRun(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: TriggerVerificationDto,
  ) {
    return this.verification.triggerRun(eventId, user.id, dto);
  }

  @Get()
  list(
    @Param('eventId') eventId: string,
    @Query('checkStatus') checkStatus?: string,
    @Query('finalDecision') finalDecision?: string,
  ) {
    return this.verification.list(eventId, checkStatus, finalDecision);
  }

  @Get(':submissionId')
  getDetail(@Param('eventId') eventId: string, @Param('submissionId') submissionId: string) {
    return this.verification.getDetail(eventId, submissionId);
  }

  @Post(':submissionId/review')
  review(
    @Param('eventId') eventId: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.verification.review(eventId, submissionId, user.id, dto);
  }
}
