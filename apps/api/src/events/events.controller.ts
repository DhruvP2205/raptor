import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import type { EventPhase } from './utils/event-phase';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateEventDto) {
    return this.events.createEvent(user, dto);
  }

  // Static route — must be declared before the dynamic ':slug' route
  // below, or Nest would try to match "mine" as a slug value.
  @Get('mine')
  listMine(@CurrentUser() user: User) {
    return this.events.listMyEvents(user.id);
  }

  @Get()
  @OptionalAuth()
  list(@Query('phase') phase?: EventPhase) {
    return this.events.listPublicEvents(phase);
  }

  @Get(':slug')
  @OptionalAuth()
  getBySlug(@Param('slug') slug: string, @CurrentUser() user?: User) {
    return this.events.getEventBySlug(
      slug,
      user ? { id: user.id, siteAdmin: user.siteAdmin } : null,
    );
  }

  @Patch(':eventId')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  update(@Param('eventId') eventId: string, @Body() dto: UpdateEventDto) {
    return this.events.updateEvent(eventId, dto);
  }

  @Post(':eventId/publish')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  publish(@Param('eventId') eventId: string) {
    return this.events.publishEvent(eventId);
  }

  @Post(':eventId/archive')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  archive(@Param('eventId') eventId: string) {
    return this.events.archiveEvent(eventId);
  }

  @Delete(':eventId')
  @HttpCode(204)
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard)
  async remove(@Param('eventId') eventId: string) {
    await this.events.deleteEvent(eventId);
  }
}
