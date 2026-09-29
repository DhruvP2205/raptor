import { Module } from '@nestjs/common';
import { GalleryRateLimitGuard } from './guards/gallery-rate-limit.guard';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionsService, GalleryRateLimitGuard],
})
export class SubmissionsModule {}
