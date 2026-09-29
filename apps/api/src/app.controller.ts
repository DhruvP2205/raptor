import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { PlatformStatsService } from './platform-stats/platform-stats.service';

@Controller()
export class AppController {
  constructor(private readonly platformStats: PlatformStatsService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: '@raptor/api' };
  }

  // docs/design/home-page.md Section 2.2 — the homepage stat strip.
  @Public()
  @Get('stats/platform')
  getPlatformStats() {
    return this.platformStats.getStats();
  }

  // Module 20 (docs/design/20-demo-environment.md Section 5) — the
  // frontend's non-dismissible banner renders only when this reports
  // true. No `/api` prefix (same correction as Module 19, D179) — this
  // codebase has none.
  @Public()
  @Get('config/public')
  publicConfig() {
    return { demoMode: process.env.DEMO_MODE === 'true' };
  }
}
