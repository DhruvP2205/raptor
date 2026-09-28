import { Module } from '@nestjs/common';
import { GlobalRankingAdminController } from './global-ranking-admin.controller';
import { GlobalRankingController } from './global-ranking.controller';
import { GlobalRankingService } from './global-ranking.service';

@Module({
  controllers: [GlobalRankingController, GlobalRankingAdminController],
  providers: [GlobalRankingService],
})
export class GlobalRankingModule {}
