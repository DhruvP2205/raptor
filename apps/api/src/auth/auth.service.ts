import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, type User } from '@prisma/client';
import type { Request, Response } from 'express';
import { generateRawToken, sha256Hex } from '../common/crypto.util';
import { normalizeEmail } from '../common/email.util';
import { rejectExistingEmail } from '../common/reject-existing-email.util';
import { MailNotConfiguredError, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SESSION_COOKIE_NAME, SessionService } from './session.service';

type EmailDispatchStatus = 'sent' | 'not_configured' | 'failed';

// A fixed, precomputed argon2 hash with no corresponding real
// password — used only to give login() something to verify against
// when no user was found, so that path costs the same as a real
// verify. Never meant to match any password; rotating it is harmless.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$f9na4+DP+xR3BejLNjwAmw$DRn1RBOQTZ4k7s+xPf7qLVDqDO3v6Ts5ZcsVyZiyk/g';

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

  private toPublicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountType: user.accountType,
      emailVerifiedAt: user.emailVerifiedAt,
      // The frontend needs this in the login/signup response itself to
      // know to route straight to the set-password screen — every other
      // route is unreachable while this is true (MustResetPasswordGuard),
      // including /auth/me, so the frontend can't discover it by asking
      // afterward.
      mustResetPassword: user.mustResetPassword,
      createdAt: user.createdAt,
    };
  }

  async signup(dto: SignupDto, req: Request, res: Response) {
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      rejectExistingEmail(existing);
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
          // Every self-signed-up account is a participant, full stop —
          // see docs/stages/02-roles-and-membership.md Section 2.1.
          // Staff accounts (JUDGE/ORGANIZER) are only ever admin-created.
          accountType: 'PARTICIPANT',
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
          rejectExistingEmail(concurrent);
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
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always pay the same argon2 cost whether or not the user exists —
    // previously this returned immediately on "no such user," before
    // ever calling argon2.verify(), which is a real, measured timing
    // side-channel (confirmed live: ~72ms for a real email vs. ~2.8ms
    // for a nonexistent one — trivially distinguishable over a
    // network). DUMMY_PASSWORD_HASH is a fixed, precomputed hash with
    // no corresponding password; verifying against it always returns
    // false but costs the same as a real verify.
    const valid = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      dto.password,
    );

    // Same generic failure for "no such user" and "wrong password" —
    // never reveal which part was wrong, in the response OR in timing.
    if (!user || !valid) {
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
    // Deliberately checked AFTER the password verify above (not
    // before) — revealing "this account is banned" only once the
    // caller has already proven the correct password is a much smaller
    // leak than revealing it via a fast-fail timing gap before any
    // credential has been checked at all.
    if (user.bannedAt) {
      throw new ForbiddenException({
        code: 'ACCOUNT_BANNED',
        message: 'This account has been banned.',
      });
    }

    await this.sessions.createSession(user.id, req, res);

    return { user: this.toPublicUser(user) };
  }

  // The only route reachable while mustResetPassword is true (enforced
  // by MustResetPasswordGuard, not by this method) — see
  // docs/stages/02-roles-and-membership.md Section 2.3 step 5.
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustResetPassword: false },
    });
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
    const email = normalizeEmail(dto.email);
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
