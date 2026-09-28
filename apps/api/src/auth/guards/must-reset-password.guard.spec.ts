import { ForbiddenException } from '@nestjs/common';
import { MustResetPasswordGuard } from './must-reset-password.guard';

function makeReflector(allowed: boolean | undefined) {
  return { getAllAndOverride: jest.fn().mockReturnValue(allowed) };
}

function makeContext(req: any) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('MustResetPasswordGuard', () => {
  it('passes through a request with no authenticated user (public routes)', () => {
    const guard = new MustResetPasswordGuard(makeReflector(undefined) as any);
    expect(guard.canActivate(makeContext({ user: undefined }))).toBe(true);
  });

  it('passes through a normal account with mustResetPassword: false', () => {
    const guard = new MustResetPasswordGuard(makeReflector(undefined) as any);
    const req = { user: { mustResetPassword: false } };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('blocks every route except the one marked @AllowWhileMustResetPassword for a locked account', () => {
    const blockedReq = { user: { mustResetPassword: true } };
    const blockedGuard = new MustResetPasswordGuard(makeReflector(false) as any);
    expect(() => blockedGuard.canActivate(makeContext(blockedReq))).toThrow(
      ForbiddenException,
    );

    const allowedReq = { user: { mustResetPassword: true } };
    const allowedGuard = new MustResetPasswordGuard(makeReflector(true) as any);
    expect(allowedGuard.canActivate(makeContext(allowedReq))).toBe(true);
  });

  it('rejects with the specific MUST_RESET_PASSWORD code, not a generic 403', () => {
    const guard = new MustResetPasswordGuard(makeReflector(undefined) as any);
    const req = { user: { mustResetPassword: true } };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'MUST_RESET_PASSWORD' }) }),
    );
  });
});
