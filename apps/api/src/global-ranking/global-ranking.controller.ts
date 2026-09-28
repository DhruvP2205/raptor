import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { GlobalRankingService } from './global-ranking.service';

// Section 1/6, docs/stages/14-global-ranking.md — the leaderboard and
// its per-person drill-down are both fully public, no auth, matching
// the reference implementation's own public JSON feed. Paginated,
// cached, snapshot-based — never a live cross-event aggregate computed
// per request.
@Controller('global-ranking')
export class GlobalRankingController {
  constructor(private readonly globalRanking: GlobalRankingService) {}

  @Get()
  @Public()
  getLeaderboard(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.globalRanking.getLeaderboard(Number(page) || 1, Number(limit) || 20, search);
  }

  @Get(':userId')
  @Public()
  getDrilldown(@Param('userId') userId: string) {
    return this.globalRanking.getUserDrilldown(userId);
  }
}
