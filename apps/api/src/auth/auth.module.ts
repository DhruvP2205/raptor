import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MustResetPasswordGuard } from './guards/must-reset-password.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    // Order matters: Nest runs global guards in registration order.
    // SessionAuthGuard must populate req.user before
    // MustResetPasswordGuard can read it.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: MustResetPasswordGuard },
  ],
  exports: [SessionService],
})
export class AuthModule {}
