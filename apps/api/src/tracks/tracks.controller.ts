import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EventRole } from '@prisma/client';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { TracksService } from './tracks.service';

@Controller('events/:eventId/tracks')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class TracksController {
  constructor(private readonly tracks: TracksService) {}

  @Post()
  create(@Param('eventId') eventId: string, @Body() dto: CreateTrackDto) {
    return this.tracks.createTrack(eventId, dto);
  }

  @Patch(':trackId')
  update(
    @Param('eventId') eventId: string,
    @Param('trackId') trackId: string,
    @Body() dto: UpdateTrackDto,
  ) {
    return this.tracks.updateTrack(eventId, trackId, dto);
  }
}
