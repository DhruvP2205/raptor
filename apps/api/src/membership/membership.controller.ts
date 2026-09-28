import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { AddOrganizerDto } from './dto/add-organizer.dto';
import { InviteJudgeDto } from './dto/invite-judge.dto';
import { RespondToInvitationDto } from './dto/respond-to-invitation.dto';
import { UpdateJudgeMembershipDto } from './dto/update-judge-membership.dto';
import { MembershipService } from './membership.service';

@Controller()
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Post('events/:eventId/organizers')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  addOrganizer(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: AddOrganizerDto,
  ) {
    return this.membership.addOrganizerDirect(eventId, user.id, dto.email);
  }

  @Post('events/:eventId/judges')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  inviteJudge(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: InviteJudgeDto,
  ) {
    return this.membership.inviteJudgeDirect(eventId, user.id, dto.email);
  }

  @Get('events/:eventId/judges')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  listJudges(@Param('eventId') eventId: string) {
    return this.membership.listJudgeInvitations(eventId);
  }

  @Post('events/:eventId/judges/:membershipId/resend')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  resendInvitation(
    @Param('eventId') eventId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: User,
  ) {
    return this.membership.resendInvitation(eventId, membershipId, user.id);
  }

  @Patch('events/:eventId/judges/:membershipId')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  updateJudgeMembership(
    @Param('eventId') eventId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateJudgeMembershipDto,
  ) {
    return this.membership.updateJudgeMembership(eventId, membershipId, user.id, dto);
  }

  // Same not-event-scoped-by-path reasoning as respond() below.
  @Get('invitations/preview')
  preview(@CurrentUser() user: User, @Query('token') token: string) {
    return this.membership.previewInvitation(token, user.id);
  }

  // Not event-scoped by path — the token itself determines which
  // event/membership this resolves to, so EventRoleGuard doesn't apply
  // here. Just needs a logged-in judge (global SessionAuthGuard).
  @Post('invitations/respond')
  respond(@CurrentUser() user: User, @Body() dto: RespondToInvitationDto) {
    return this.membership.respondToInvitation(
      dto.token,
      user.id,
      dto.accept,
    );
  }
}
