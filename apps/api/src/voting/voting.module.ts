import { Module } from '@nestjs/common';
import { PublicVotingController } from './public-voting.controller';
import { PowCaptchaService } from './pow-captcha.service';
import { VoteCastingController } from './vote-casting.controller';
import { VotingResultsService } from './voting-results.service';
import { VotingController } from './voting.controller';
import { VotingService } from './voting.service';

@Module({
  controllers: [VotingController, VoteCastingController, PublicVotingController],
  providers: [VotingService, VotingResultsService, PowCaptchaService],
})
export class VotingModule {}
