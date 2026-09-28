import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireSiteAdmin } from '../authz/decorators/require-site-admin.decorator';
import { SiteAdminGuard } from '../authz/guards/site-admin.guard';
import { CreateGithubTokenDto } from './dto/create-github-token.dto';
import { GithubTokensService } from './github-tokens.service';

// Admin-only, platform-wide (not event-scoped) — same shape as
// AdminController's staff-accounts route (Section 5: "never surfaced
// to organizers").
@Controller('admin/github-tokens')
@RequireSiteAdmin()
@UseGuards(SiteAdminGuard)
export class GithubTokensController {
  constructor(private readonly githubTokens: GithubTokensService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateGithubTokenDto) {
    return this.githubTokens.create(user.id, dto);
  }

  @Get()
  list() {
    return this.githubTokens.list();
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() user: User, @Param('id') id: string) {
    return this.githubTokens.revoke(user.id, id);
  }
}
