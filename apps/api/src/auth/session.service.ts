import { Injectable, Logger } from '@nestjs/common';
import type { Session } from '@prisma/client';
import type { Request, Response } from 'express';
import { generateRawToken, sha256Hex } from '../common/crypto.util';
import { hashIpOrNull } from '../common/ip-hash.util';
import { PrismaService } from '../prisma/prisma.service';

export const SESSION_COOKIE_NAME = 'raptor_session';

function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 30);
  return days * 24 * 60 * 60 * 1000;
}

// Opaque server-side sessions, not JWTs — instantly revocable by
// deleting/marking the Session row. See
// docs/stages/01-auth-and-email-setup.md Section 2.
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {
    if (!process.env.APP_SECRET) {
      this.logger.warn(
        'APP_SECRET is not configured — session ipHash will be left null rather than hashed with no key (an unkeyed hash of an IP address is trivially reversible and would give no real protection).',
      );
    }
  }

  async createSession(
    userId: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const rawToken = generateRawToken();
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + sessionTtlMs());
    const userAgent = req.headers['user-agent'];
    const ipHash = hashIpOrNull(req.ip);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
        ipHash,
        expiresAt,
      },
    });

    this.setCookie(res, rawToken, expiresAt);
  }

  setCookie(res: Response, rawToken: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }

  // Logout: a stolen/cached token must stop working the instant this
  // runs, not just stop being sent by the legitimate client.
  async revokeByRawToken(rawToken: string): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });
    if (session && !session.revokedAt) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async resolveByRawToken(
    rawToken: string,
  ): Promise<(Session & { user: import('@prisma/client').User }) | null> {
    const tokenHash = sha256Hex(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    return session;
  }
}
