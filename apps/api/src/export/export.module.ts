import { Module } from '@nestjs/common';
import { AdminExportController } from './admin-export.controller';
import { AdminExportService } from './admin-export.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  controllers: [ExportController, AdminExportController],
  providers: [ExportService, AdminExportService],
})
export class ExportModule {}
