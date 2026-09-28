import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { AssignmentsService } from './assignments.service';
import { AutoAssignDto } from './dto/auto-assign.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { TransferAssignmentDto } from './dto/transfer-assignment.dto';

// Organizer-only throughout (siteAdmin bypasses via EventRoleGuard,
// audited) — every action in this module is organizer/admin-facing;
// nothing here is ever exposed to a judge or participant directly.
@Controller('events/:eventId/assignments')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('assignable-submissions')
  listAssignableSubmissions(@Param('eventId') eventId: string) {
    return this.assignments.listAssignableSubmissions(eventId);
  }

  // Judge-facing — overrides the controller-level ORGANIZER requirement
  // for this one route (EventRoleGuard's getAllAndOverride checks the
  // handler first). A static sibling path segment, not a dynamic ':id'
  // — no ambiguity with any other route on this controller.
  @Get('mine')
  @RequireEventRole(EventRole.JUDGE)
  listMine(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.assignments.listMine(eventId, user.id);
  }

  @Get('progress')
  progress(@Param('eventId') eventId: string) {
    return this.assignments.progress(eventId);
  }

  @Get()
  list(
    @Param('eventId') eventId: string,
    @Query('judgeId') judgeId?: string,
    @Query('submissionId') submissionId?: string,
    @Query('status') status?: string,
  ) {
    return this.assignments.list(eventId, judgeId, submissionId, status);
  }

  @Post()
  manualAssign(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.manualAssign(eventId, user.id, dto);
  }

  @Post('auto-assign')
  autoAssign(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: AutoAssignDto,
  ) {
    return this.assignments.autoAssign(eventId, user.id, dto);
  }

  @Post(':id/transfer')
  transfer(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: TransferAssignmentDto,
  ) {
    return this.assignments.transfer(eventId, id, user.id, dto);
  }
}
