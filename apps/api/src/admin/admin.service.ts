import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, type User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { normalizeEmail } from '../common/email.util';
import { rejectExistingEmail } from '../common/reject-existing-email.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffAccountDto } from './dto/create-staff-account.dto';

// Admin-driven staff account creation — see
// docs/stages/02-roles-and-membership.md Section 2.3. siteAdmin-only;
// enforced by SiteAdminGuard at the controller, not re-checked here.
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createStaffAccount(
    actingAdminUserId: string,
    dto: CreateStaffAccountDto,
  ): Promise<Pick<User, 'id' | 'email' | 'displayName' | 'accountType' | 'mustResetPassword'>> {
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      rejectExistingEmail(existing);
    }

    const passwordHash = await argon2.hash(dto.temporaryPassword);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName,
          accountType: dto.role,
          mustResetPassword: true,
        },
      });
    } catch (err) {
      // Same TOCTOU race as signup (Module 1, D58) — unlikely for a
      // manual admin action, but the same fix applies for the same
      // reason: don't let a lost race surface as a raw 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const concurrent = await this.prisma.user.findUnique({
          where: { email },
        });
        if (concurrent) {
          rejectExistingEmail(concurrent);
        }
      }
      throw err;
    }

    // Role assignment is exactly the kind of action CLAUDE.md's
    // principle 5 calls out by name — and it's irreversible (D10), so
    // the record of who made this choice matters more than most.
    await this.audit.record(actingAdminUserId, 'STAFF_ACCOUNT_CREATED', {
      newUserId: user.id,
      email: user.email,
      role: dto.role,
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountType: user.accountType,
      mustResetPassword: user.mustResetPassword,
    };
  }
}
