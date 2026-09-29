import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AllowWhileMustResetPassword } from './decorators/allow-while-must-reset-password.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  signup(
    @Body() dto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.signup(dto, req, res);
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(dto, req, res);
  }

  // @Public() deliberately — logout does its own lenient, best-effort
  // cookie lookup (see AuthService.logout) rather than requiring a
  // still-valid session, so a double-logout or an already-expired
  // session still returns a clean 200 instead of a confusing 401.
  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req, res);
    return { message: 'Logged out.' };
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Public()
  @Post('verify-email/resend')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto);
  }

  // The one route an admin-created staff account can reach before its
  // first password change — see MustResetPasswordGuard.
  @AllowWhileMustResetPassword()
  @Post('set-password')
  @HttpCode(200)
  async setPassword(
    @CurrentUser() user: User,
    @Body() dto: SetPasswordDto,
  ) {
    await this.auth.setPassword(user.id, dto.newPassword);
    return { message: 'Password updated.' };
  }

  // Not named in the stage doc, but a necessary complement to a
  // cookie-based session: the frontend can't read an HttpOnly cookie
  // itself, so it needs some way to ask "who, if anyone, is currently
  // logged in" on page load. Implicitly protected — no @Public() — by
  // the global SessionAuthGuard.
  @Get('me')
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountType: user.accountType,
      emailVerifiedAt: user.emailVerifiedAt,
      mustResetPassword: user.mustResetPassword,
      siteAdmin: user.siteAdmin,
    };
  }
}
