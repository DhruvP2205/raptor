import { Global, Module } from '@nestjs/common';
import { GlobalRankingQueueService } from './global-ranking-queue.service';
import { VerificationQueueService } from './verification-queue.service';

@Global()
@Module({
  providers: [VerificationQueueService, GlobalRankingQueueService],
  exports: [VerificationQueueService, GlobalRankingQueueService],
})
export class QueuesModule {}
