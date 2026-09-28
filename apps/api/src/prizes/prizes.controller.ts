import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EventRole } from '@prisma/client';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { CreatePrizeDto } from './dto/create-prize.dto';
import { UpdatePrizeDto } from './dto/update-prize.dto';
import { PrizesService } from './prizes.service';

@Controller('events/:eventId/prizes')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class PrizesController {
  constructor(private readonly prizes: PrizesService) {}

  @Post()
  create(@Param('eventId') eventId: string, @Body() dto: CreatePrizeDto) {
    return this.prizes.createPrize(eventId, dto);
  }

  @Patch(':prizeId')
  update(
    @Param('eventId') eventId: string,
    @Param('prizeId') prizeId: string,
    @Body() dto: UpdatePrizeDto,
  ) {
    return this.prizes.updatePrize(eventId, prizeId, dto);
  }
}
