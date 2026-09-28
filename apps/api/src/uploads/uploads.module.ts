import { Module } from '@nestjs/common';
import { UploadRateLimitGuard } from './guards/upload-rate-limit.guard';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UploadRateLimitGuard],
})
export class UploadsModule {}
