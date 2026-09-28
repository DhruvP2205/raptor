import { Module } from '@nestjs/common';
import { JoinRateLimitGuard } from './guards/join-rate-limit.guard';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  controllers: [TeamsController],
  providers: [TeamsService, JoinRateLimitGuard],
})
export class TeamsModule {}
