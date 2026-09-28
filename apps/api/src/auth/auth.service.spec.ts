import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

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
  });

  describe('login', () => {
    it('rejects a banned account even with the correct password', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'banned@example.com',
        bannedAt: new Date(),
        passwordHash: 'irrelevant',
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
