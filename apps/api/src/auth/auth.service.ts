import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, type User } from '@prisma/client';
import type { Request, Response } from 'express';
import { generateRawToken, sha256Hex } from '../common/crypto.util';
import { MailNotConfiguredError, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SESSION_COOKIE_NAME, SessionService } from './session.service';

type EmailDispatchStatus = 'sent' | 'not_configured' | 'failed';

function isTestMode(): boolean {
  return process.env.TEST_MODE === 'true';
}

function verificationTtlMs(): number {
  const hours = Number(process.env.VERIFICATION_TOKEN_TTL_HOURS ?? 24);
  return hours * 60 * 60 * 1000;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }

  // Shared by the up-front check in signup() and by the concurrent
  // -signup race recovery below — same distinct banned-vs-already
  // -registered errors either way.
  private rejectExistingEmail(user: User): never {
    if (user.bannedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_BANNED',
        message: 'This email address is not permitted to register.',
      });
    }
    throw new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with this email already exists.',
    });
  }

  async signup(dto: SignupDto, req: Request, res: Response) {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      this.rejectExistingEmail(existing);
    }

    const passwordHash = await argon2.hash(dto.password);
    const rawToken = generateRawToken();
    const verificationTokenHash = sha256Hex(rawToken);
    const verificationTokenExpiresAt = new Date(
      Date.now() + verificationTtlMs(),
    );

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName,
          verificationTokenHash,
          verificationTokenExpiresAt,
        },
      });
    } catch (err) {
      // Lost a race against a concurrent signup for the same email —
      // the up-front findUnique above can't see a write that lands
      // between that check and this create. Re-check and give the same
      // accurate (banned vs. already-registered) error instead of
      // letting a raw unique-constraint error surface as a 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const concurrent = await this.prisma.user.findUnique({
          where: { email },
        });
        if (concurrent) {
          this.rejectExistingEmail(concurrent);
        }
      }
      throw err;
    }

    const emailDispatch = await this.sendVerificationEmail(email, rawToken);

    // Signup logs the new account in immediately — Section 3 is silent
    // on this either way, but "login is not gated on verification"
    // strongly implies a just-signed-up, unverified user should be able
    // to browse right away rather than needing a second /auth/login
    // call with the password they just typed.
    await this.sessions.createSession(user.id, req, res);

    return { user: this.toPublicUser(user), emailDispatch };
  }

  async login(dto: LoginDto, req: Request, res: Response) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Generic failure for both "no such user" and "wrong password" —
    // never reveal which part was wrong.
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    }

    // TODO: undocumented decision, needs confirmation — see D55's note
    // in docs/DECISIONS.md. The stage doc only specifies blocking
    // signup with a banned email; it's silent on whether an existing
    // banned account can still log in. Blocking login here too, since
    // allowing full login for a banned account while only blocking
    // re-signup would be an inconsistent half-enforcement. Flag back if
    // a different behavior is wanted once the ban-issuing module exists.
    if (user.bannedAt) {
      throw new ForbiddenException({
        code: 'ACCOUNT_BANNED',
        message: 'This account has been banned.',
      });
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    }

    await this.sessions.createSession(user.id, req, res);

    return { user: this.toPublicUser(user) };
  }

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      await this.sessions.revokeByRawToken(rawToken);
    }
    this.sessions.clearCookie(res);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = sha256Hex(dto.token);
    const user = await this.prisma.user.findUnique({
      where: { verificationTokenHash: tokenHash },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'This verification link is invalid.',
      });
    }

    if (user.emailVerifiedAt) {
      // Idempotent: re-visiting an already-used link is a no-op
      // success, per Section 3 of the stage doc.
      return { status: 'already_verified' as const };
    }

    if (
      !user.verificationTokenExpiresAt ||
      user.verificationTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'This verification link has expired. Request a new one.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    return { status: 'verified' as const };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always the same generic response whether or not the account
    // exists or is already verified — avoids leaking which emails are
    // registered.
    if (user && !user.emailVerifiedAt) {
      const rawToken = generateRawToken();
      const verificationTokenHash = sha256Hex(rawToken);
      const verificationTokenExpiresAt = new Date(
        Date.now() + verificationTtlMs(),
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: { verificationTokenHash, verificationTokenExpiresAt },
      });

      await this.sendVerificationEmail(email, rawToken);
    }

    return {
      message:
        'If that email exists and is unverified, a new verification link has been sent.',
    };
  }

  // The one call site that checks TEST_MODE, per
  // docs/stages/01-auth-and-email-setup.md Section 5.5. If a second
  // call site ever checks this flag, that's scope creep — flag it.
  private async sendVerificationEmail(
    email: string,
    rawToken: string,
  ): Promise<EmailDispatchStatus> {
    const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
    const link = `${webUrl}/verify-email?token=${rawToken}`;

    if (isTestMode()) {
      this.logger.log(
        `[TEST_MODE] verification_token email=${email} token=${rawToken} link=${link}`,
      );

      if (!this.mail.isConfigured()) {
        return 'not_configured';
      }

      try {
        await this.mail.sendMail(
          email,
          '[TEST MODE] Verification email — do not treat as real',
          `This is a test-mode email sent during development or automated testing. If you were not expecting this, no action is needed.\n\nVerify your email: ${link}`,
        );
        return 'sent';
      } catch (err) {
        this.logger.warn(
          `TEST_MODE verification email send failed for ${email}: ${(err as Error).message}`,
        );
        return 'failed';
      }
    }

    if (!this.mail.isConfigured()) {
      // Never silently pretend the email sent — the caller surfaces
      // this status so the user sees a real "contact your
      // administrator" message instead of a false success.
      return 'not_configured';
    }

    try {
      await this.mail.sendMail(
        email,
        'Verify your Raptor account',
        `Verify your email: ${link}`,
      );
      return 'sent';
    } catch (err) {
      if (err instanceof MailNotConfiguredError) {
        return 'not_configured';
      }
      this.logger.warn(
        `Verification email send failed for ${email}: ${(err as Error).message}`,
      );
      return 'failed';
    }
  }
}
