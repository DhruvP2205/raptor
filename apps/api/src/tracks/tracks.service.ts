import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MarkdownService } from '../markdown/markdown.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';

// Section 5, docs/stages/03-event-management.md. Can be added after
// PUBLISHED, even after submissions have opened — no status check on
// creation. No delete: the doc explicitly flags removing a track that
// already has submissions attached as unresolved ("not resolved in
// this stage; flag if it comes up during Module 5") — building delete
// now would mean inventing that answer ourselves.
@Injectable()
export class TracksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
  ) {}

  async createTrack(eventId: string, dto: CreateTrackDto) {
    const existing = await this.prisma.track.findUnique({
      where: { eventId_name: { eventId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'TRACK_NAME_TAKEN',
        message: 'A track with this name already exists on this event.',
      });
    }

    const track = await this.prisma.track.create({
      data: { eventId, name: dto.name, description: dto.description ?? null },
    });
    return this.toPublicTrack(track);
  }

  async updateTrack(eventId: string, trackId: string, dto: UpdateTrackDto) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track || track.eventId !== eventId) {
      throw new NotFoundException({
        code: 'TRACK_NOT_FOUND',
        message: 'No such track on this event.',
      });
    }

    if (dto.name !== undefined && dto.name !== track.name) {
      const existing = await this.prisma.track.findUnique({
        where: { eventId_name: { eventId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException({
          code: 'TRACK_NAME_TAKEN',
          message: 'A track with this name already exists on this event.',
        });
      }
    }

    const updated = await this.prisma.track.update({
      where: { id: trackId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
    return this.toPublicTrack(updated);
  }

  private toPublicTrack<T extends { description: string | null }>(track: T) {
    return {
      ...track,
      descriptionHtml: track.description
        ? this.markdown.renderToSafeHtml(track.description)
        : null,
    };
  }
}
