import { Module } from '@nestjs/common';
import { CalibrationModule } from '../calibration/calibration.module';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';

@Module({
  imports: [CalibrationModule],
  controllers: [ScoringController],
  providers: [ScoringService],
})
export class ScoringModule {}
