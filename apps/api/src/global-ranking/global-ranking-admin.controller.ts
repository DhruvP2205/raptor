import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { GlobalAwardKind, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireSiteAdmin } from '../authz/decorators/require-site-admin.decorator';
import { SiteAdminGuard } from '../authz/guards/site-admin.guard';
import { TriggerRecomputeDto } from './dto/trigger-recompute.dto';
import { UpdatePointsConfigDto } from './dto/update-points-config.dto';
import { GlobalRankingService } from './global-ranking.service';

// siteAdmin-only — this is a platform-wide table, not per-event
// (Section 3, docs/stages/14-global-ranking.md), so there's no
// EventRoleGuard/:eventId scope to check against; same precedent as
// AdminController's staff-account creation.
@Controller('admin/global-ranking')
@RequireSiteAdmin()
@UseGuards(SiteAdminGuard)
export class GlobalRankingAdminController {
  constructor(private readonly globalRanking: GlobalRankingService) {}

  @Get('points-config')
  getPointsConfig() {
    return this.globalRanking.getPointsConfig();
  }

  @Patch('points-config/:awardKind')
  updatePointsConfig(
    @Param('awardKind', new ParseEnumPipe(GlobalAwardKind)) awardKind: GlobalAwardKind,
    @CurrentUser() user: User,
    @Body() dto: UpdatePointsConfigDto,
  ) {
    return this.globalRanking.updatePointsConfig(awardKind, user.id, dto);
  }

  @Post('recompute')
  triggerRecompute(@CurrentUser() user: User, @Body() dto: TriggerRecomputeDto) {
    return this.globalRanking.triggerRecompute(user.id, dto.reason);
  }
}
