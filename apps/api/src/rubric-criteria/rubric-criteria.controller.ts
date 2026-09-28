import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { ReplaceRubricDto } from './dto/replace-rubric.dto';
import { RubricCriteriaService } from './rubric-criteria.service';

// Organizer-only (siteAdmin bypasses via EventRoleGuard, audited). No
// GET here — rubricCriteria is included directly on the public event
// response (events.service.ts), same pattern as Track/Prize.
@Controller('events/:eventId/rubric-criteria')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class RubricCriteriaController {
  constructor(private readonly rubricCriteria: RubricCriteriaService) {}

  @Put()
  replace(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: ReplaceRubricDto,
  ) {
    return this.rubricCriteria.replace(eventId, user.id, dto);
  }
}
