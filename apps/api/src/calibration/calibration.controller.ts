import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AnyOrganizerOrAdminGuard } from '../authz/guards/any-organizer-or-admin.guard';
import { CalibrationService } from './calibration.service';

// Platform-wide, not event-scoped (Section 8, docs/stages/09-
// normalization.md) — any organizer or admin can look up any judge.
@Controller('admin/judges')
@UseGuards(AnyOrganizerOrAdminGuard)
export class CalibrationController {
  constructor(private readonly calibration: CalibrationService) {}

  @Get(':userId/calibration')
  getLiveProfile(@Param('userId') userId: string) {
    return this.calibration.getLiveProfile(userId);
  }
}
