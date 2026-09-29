import { HttpException } from '@nestjs/common';
import type { RateLimitService } from '../../redis/rate-limit.service';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

function makeContext(body: unknown, ip = '1.2.3.4') {
  const req = { body, ip };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('LoginRateLimitGuard (Module 24, A4)', () => {
  afterEach(() => {
    delete process.env.LOGIN_RATE_LIMIT_ATTEMPTS;
    delete process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES;
  });

  it('allows the request and keys by (ip, normalized email) when under the limit', async () => {
    const consume = jest.fn().mockResolvedValue(true);
    const guard = new LoginRateLimitGuard({ consume } as unknown as RateLimitService);

    const allowed = await guard.canActivate(makeContext({ email: 'Judge@Example.com', password: 'x' }));

    expect(allowed).toBe(true);
    expect(consume).toHaveBeenCalledWith('login:1.2.3.4:judge@example.com', 10, 15 * 60);
  });

  it('throws a generic 429 once the limit is exceeded, without confirming whether the email exists', async () => {
    const consume = jest.fn().mockResolvedValue(false);
    const guard = new LoginRateLimitGuard({ consume } as unknown as RateLimitService);

    await expect(guard.canActivate(makeContext({ email: 'a@b.com', password: 'x' }))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(makeContext({ email: 'a@b.com', password: 'x' }));
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
      expect(JSON.stringify((err as HttpException).getResponse())).not.toMatch(/exist|registered|found/i);
    }
  });

  it('respects LOGIN_RATE_LIMIT_ATTEMPTS / LOGIN_RATE_LIMIT_WINDOW_MINUTES overrides', async () => {
    process.env.LOGIN_RATE_LIMIT_ATTEMPTS = '3';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES = '5';
    const consume = jest.fn().mockResolvedValue(true);
    const guard = new LoginRateLimitGuard({ consume } as unknown as RateLimitService);

    await guard.canActivate(makeContext({ email: 'a@b.com', password: 'x' }));

    expect(consume).toHaveBeenCalledWith('login:1.2.3.4:a@b.com', 3, 5 * 60);
  });

  it('does not crash on a missing/malformed body — falls back to an "unknown" email key', async () => {
    const consume = jest.fn().mockResolvedValue(true);
    const guard = new LoginRateLimitGuard({ consume } as unknown as RateLimitService);

    const allowed = await guard.canActivate(makeContext(undefined));

    expect(allowed).toBe(true);
    expect(consume).toHaveBeenCalledWith('login:1.2.3.4:unknown', 10, 15 * 60);
  });
});
