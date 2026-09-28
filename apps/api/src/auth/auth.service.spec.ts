import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

function makeUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeMail() {
  return {
    isConfigured: jest.fn().mockReturnValue(false),
    sendMail: jest.fn(),
  };
}

function makeSessions() {
  return {
    createSession: jest.fn(),
    revokeByRawToken: jest.fn(),
    clearCookie: jest.fn(),
    resolveByRawToken: jest.fn(),
  };
}

const req = { cookies: {}, headers: {}, ip: '127.0.0.1' } as unknown as Request;
const res = {} as Response;

describe('AuthService', () => {
  describe('signup', () => {
    it('rejects with a distinct error when the email belongs to a banned account', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'banned@example.com',
        bannedAt: new Date(),
      });
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(
        service.signup(
          { email: 'banned@example.com', password: 'password123', displayName: 'X' },
          req,
          res,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects with a distinct (non-banned) error when the email is already registered', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'taken@example.com',
        bannedAt: null,
      });
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(
        service.signup(
          { email: 'taken@example.com', password: 'password123', displayName: 'X' },
          req,
          res,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recovers from a concurrent-signup race with the same accurate error, not a raw 500', async () => {
      const prisma = makePrisma();
      // Up-front check sees nothing (genuinely didn't exist yet)...
      prisma.user.findUnique.mockResolvedValueOnce(null);
      // ...but a concurrent request's create() won the race, so this
      // one's create() hits the real unique constraint.
      prisma.user.create.mockRejectedValue(makeUniqueConstraintError());
      // Re-check after the race finds the concurrent winner.
      prisma.user.findUnique.mockResolvedValueOnce({
        id: '1',
        email: 'racer@example.com',
        bannedAt: null,
      });
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(
        service.signup(
          { email: 'racer@example.com', password: 'password123', displayName: 'X' },
          req,
          res,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('re-throws an unrelated create() failure as-is (not treated as a lost race)', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const dbDown = new Error('connection refused');
      prisma.user.create.mockRejectedValue(dbDown);
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(
        service.signup(
          { email: 'new@example.com', password: 'password123', displayName: 'X' },
          req,
          res,
        ),
      ).rejects.toBe(dbDown);
    });
  });

  describe('login', () => {
    it('rejects a banned account even with the correct password', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'banned@example.com',
        bannedAt: new Date(),
        // A real hash for 'whatever' — login() now always calls
        // argon2.verify() (see D-timing-fix), so this has to actually
        // verify for the test to exercise "correct password, still
        // banned" rather than failing earlier on a bad hash format.
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$Tzp1wd/n6UPFxVztINRzHw$78dmaFfdxdtgfjvSA+VFoj2CFpu9q2gDf51DXlTjt14',
      });
      const sessions = makeSessions();
      const service = new AuthService(prisma as any, makeMail() as any, sessions as any);

      await expect(
        service.login({ email: 'banned@example.com', password: 'whatever' }, req, res),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with a generic invalid-credentials error', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }, req, res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('still pays the full argon2 cost when no user is found (timing-safety regression guard)', async () => {
      // argon2's native verify export isn't spy-able (non-configurable
      // binding property), so this asserts the observable consequence
      // instead: a real argon2.verify() call against a real hash takes
      // tens of milliseconds, not sub-millisecond. This is exactly the
      // gap that was measured live before the fix (~72ms for a real
      // email vs. ~2.8ms for a nonexistent one) — a nonexistent-user
      // login finishing in under 10ms here would mean the short-circuit
      // regressed.
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      const start = Date.now();
      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }, req, res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      const elapsedMs = Date.now() - start;

      expect(elapsedMs).toBeGreaterThan(10);
    });
  });

  describe('verifyEmail', () => {
    it('treats re-verifying an already-verified account as an idempotent no-op', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        emailVerifiedAt: new Date(),
        // Deliberately expired — must not matter once already verified.
        verificationTokenExpiresAt: new Date(Date.now() - 1000 * 60 * 60),
      });
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      const result = await service.verifyEmail({ token: 'whatever' });
      expect(result).toEqual({ status: 'already_verified' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an expired, not-yet-verified token with a specific expired error', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        emailVerifiedAt: null,
        verificationTokenExpiresAt: new Date(Date.now() - 1000),
      });
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(service.verifyEmail({ token: 'whatever' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('verifies a valid, unexpired token and stamps emailVerifiedAt', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        emailVerifiedAt: null,
        verificationTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      const result = await service.verifyEmail({ token: 'whatever' });
      expect(result).toEqual({ status: 'verified' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it('rejects an unknown verification token', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new AuthService(
        prisma as any,
        makeMail() as any,
        makeSessions() as any,
      );

      await expect(service.verifyEmail({ token: 'nonsense' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
