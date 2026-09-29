import { HttpException } from '@nestjs/common';
import type { RateLimitService } from '../../redis/rate-limit.service';
import { GalleryRateLimitGuard } from './gallery-rate-limit.guard';

function makeContext(ip = '9.9.9.9') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as any;
}

describe('GalleryRateLimitGuard (Module 24, A4)', () => {
  afterEach(() => {
    delete process.env.GALLERY_RATE_LIMIT_PER_MINUTE;
  });

  it('allows the request under the default 120/minute limit, keyed by IP', async () => {
    const consume = jest.fn().mockResolvedValue(true);
    const guard = new GalleryRateLimitGuard({ consume } as unknown as RateLimitService);

    expect(await guard.canActivate(makeContext())).toBe(true);
    expect(consume).toHaveBeenCalledWith('gallery-read:9.9.9.9', 120, 60);
  });

  it('throws a 429 once the limit is exceeded', async () => {
    const consume = jest.fn().mockResolvedValue(false);
    const guard = new GalleryRateLimitGuard({ consume } as unknown as RateLimitService);

    await expect(guard.canActivate(makeContext())).rejects.toThrow(HttpException);
  });

  it('respects GALLERY_RATE_LIMIT_PER_MINUTE override', async () => {
    process.env.GALLERY_RATE_LIMIT_PER_MINUTE = '5';
    const consume = jest.fn().mockResolvedValue(true);
    const guard = new GalleryRateLimitGuard({ consume } as unknown as RateLimitService);

    await guard.canActivate(makeContext());

    expect(consume).toHaveBeenCalledWith('gallery-read:9.9.9.9', 5, 60);
  });
});
