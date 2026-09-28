import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EventRole } from '@prisma/client';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOAD_LIMITS } from './upload-limits';
import { UploadRateLimitGuard } from './guards/upload-rate-limit.guard';
import { UploadsService } from './uploads.service';

@Controller()
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('events/:eventId/poster')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard, UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.poster.maxBytes } }),
  )
  async uploadPoster(
    @Param('eventId') eventId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE', message: 'No file uploaded.' });
    }
    const id = await this.uploads.processAndStore(file.buffer, 'poster');
    const posterUrl = `/uploads/${id}`;
    await this.prisma.event.update({ where: { id: eventId }, data: { posterUrl } });
    return { posterUrl };
  }

  @Post('events/:eventId/thumbnail')
  @RequireEventRole(EventRole.ORGANIZER)
  @UseGuards(EventRoleGuard, UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.thumbnail.maxBytes } }),
  )
  async uploadThumbnail(
    @Param('eventId') eventId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE', message: 'No file uploaded.' });
    }
    const id = await this.uploads.processAndStore(file.buffer, 'thumbnail');
    const thumbnailUrl = `/uploads/${id}`;
    await this.prisma.event.update({ where: { id: eventId }, data: { thumbnailUrl } });
    return { thumbnailUrl };
  }

  // Dedicated serving route — Content-Type is set from the re-encoded
  // file's actual magic bytes, never trusted from upload time or
  // inferred from a stored extension (Section 7.2). Not statically
  // served by Express anywhere else; this is the only path a stored
  // file is ever reachable through.
  @Public()
  @Get('uploads/:id')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.uploads.read(id);
    const mime = await this.uploads.detectMimeType(buffer);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  }
}
