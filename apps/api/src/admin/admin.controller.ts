import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireSiteAdmin } from '../authz/decorators/require-site-admin.decorator';
import { SiteAdminGuard } from '../authz/guards/site-admin.guard';
import { AdminService } from './admin.service';
import { CreateStaffAccountDto } from './dto/create-staff-account.dto';

@Controller('admin')
@RequireSiteAdmin()
@UseGuards(SiteAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('staff-accounts')
  createStaffAccount(
    @CurrentUser() user: User,
    @Body() dto: CreateStaffAccountDto,
  ) {
    return this.admin.createStaffAccount(user.id, dto);
  }
}
