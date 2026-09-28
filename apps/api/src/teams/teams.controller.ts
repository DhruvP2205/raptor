import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTeamDto } from './dto/create-team.dto';
import { DeleteTeamDto } from './dto/delete-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { JoinRateLimitGuard } from './guards/join-rate-limit.guard';
import { TeamsService } from './teams.service';

@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post('events/:eventId/teams')
  create(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: CreateTeamDto) {
    return this.teams.createTeam(eventId, user.id, dto.name);
  }

  // Not event-scoped by path, per the stage doc's own literal endpoint
  // shapes below — the team id (or join code) is globally unique, so
  // there's no ambiguity to resolve via an eventId in the URL. Matches
  // Module 2's /invitations/respond, which is the same shape for the
  // same reason.
  @Post('teams/join')
  @UseGuards(JoinRateLimitGuard)
  join(@CurrentUser() user: User, @Body() dto: JoinTeamDto) {
    return this.teams.joinTeam(user.id, dto.code);
  }

  @Post('teams/:teamId/regenerate-link')
  regenerateLink(@Param('teamId') teamId: string, @CurrentUser() user: User) {
    return this.teams.regenerateLink(teamId, user.id);
  }

  @Delete('teams/:teamId/members/:userId')
  @HttpCode(204)
  async kick(
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: User,
  ) {
    await this.teams.kickMember(teamId, user.id, targetUserId);
  }

  @Delete('teams/:teamId')
  @HttpCode(204)
  async remove(
    @Param('teamId') teamId: string,
    @CurrentUser() user: User,
    @Body() _dto: DeleteTeamDto,
  ) {
    await this.teams.deleteTeam(teamId, user.id);
  }
}
