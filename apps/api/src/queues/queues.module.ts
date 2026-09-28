import { Global, Module } from '@nestjs/common';
import { VerificationQueueService } from './verification-queue.service';

@Global()
@Module({
  providers: [VerificationQueueService],
  exports: [VerificationQueueService],
})
export class QueuesModule {}
