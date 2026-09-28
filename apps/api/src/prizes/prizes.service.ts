import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrizeDto } from './dto/create-prize.dto';
import { UpdatePrizeDto } from './dto/update-prize.dto';

// Section 5, docs/stages/03-event-management.md. No delete — same
// reasoning as tracks (TracksService): removal semantics aren't
// resolved by the doc, and prizes can reference a track, so the same
// "not invented here" caution applies.
@Injectable()
export class PrizesService {
  constructor(private readonly prisma: PrismaService) {}

  async createPrize(eventId: string, dto: CreatePrizeDto) {
    if (dto.trackId) {
      await this.assertTrackBelongsToEvent(eventId, dto.trackId);
    }

    return this.prisma.prize.create({
      data: {
        eventId,
        name: dto.name,
        rank: dto.rank,
        trackId: dto.trackId ?? null,
        decidedBy: dto.decidedBy,
      },
    });
  }

  async updatePrize(eventId: string, prizeId: string, dto: UpdatePrizeDto) {
    const prize = await this.prisma.prize.findUnique({ where: { id: prizeId } });
    if (!prize || prize.eventId !== eventId) {
      throw new NotFoundException({
        code: 'PRIZE_NOT_FOUND',
        message: 'No such prize on this event.',
      });
    }

    if (dto.trackId) {
      await this.assertTrackBelongsToEvent(eventId, dto.trackId);
    }

    return this.prisma.prize.update({
      where: { id: prizeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.rank !== undefined ? { rank: dto.rank } : {}),
        ...(dto.trackId !== undefined ? { trackId: dto.trackId } : {}),
        ...(dto.decidedBy !== undefined ? { decidedBy: dto.decidedBy } : {}),
      },
    });
  }

  // Cross-event isolation, same principle as everywhere else in this
  // project — a prize can't reference a track belonging to a DIFFERENT
  // event, even if the caller somehow guesses a valid trackId.
  private async assertTrackBelongsToEvent(eventId: string, trackId: string): Promise<void> {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track || track.eventId !== eventId) {
      throw new BadRequestException({
        code: 'TRACK_NOT_ON_EVENT',
        message: 'That track does not belong to this event.',
      });
    }
  }
}
