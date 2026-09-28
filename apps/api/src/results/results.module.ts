import { Module } from '@nestjs/common';
import { PublicResultsController } from './public-results.controller';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  controllers: [ResultsController, PublicResultsController],
  providers: [ResultsService],
})
export class ResultsModule {}
