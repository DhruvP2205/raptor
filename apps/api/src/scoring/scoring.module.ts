import { Module } from '@nestjs/common';
import { CalibrationModule } from '../calibration/calibration.module';
import { AuditScoringController } from './audit-scoring.controller';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';

@Module({
  imports: [CalibrationModule],
  controllers: [ScoringController, AuditScoringController],
  providers: [ScoringService],
})
export class ScoringModule {}
