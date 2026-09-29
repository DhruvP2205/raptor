import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { OrganizerAuditLogController } from './organizer-audit-log.controller';
import { OrganizerAuditLogService } from './organizer-audit-log.service';

@Global()
@Module({
  controllers: [OrganizerAuditLogController],
  providers: [AuditService, OrganizerAuditLogService],
  exports: [AuditService],
})
export class AuditModule {}
