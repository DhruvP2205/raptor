import { Module } from '@nestjs/common';
import { GithubTokensController } from './github-tokens.controller';
import { GithubTokensService } from './github-tokens.service';

@Module({
  controllers: [GithubTokensController],
  providers: [GithubTokensService],
  exports: [GithubTokensService],
})
export class GithubTokensModule {}
