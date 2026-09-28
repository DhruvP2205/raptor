import { RateLimitService } from './rate-limit.service';

function makeRedis(client: any) {
  return { client };
}

describe('RateLimitService', () => {
  it('allows the request while under the limit', async () => {
    const client = { incr: jest.fn().mockResolvedValue(3), expire: jest.fn() };
    const service = new RateLimitService(makeRedis(client) as any);

    expect(await service.consume('key', 10, 3600)).toBe(true);
  });

  it('sets the window expiry only on the first increment', async () => {
    const client = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
    const service = new RateLimitService(makeRedis(client) as any);

    await service.consume('key', 10, 3600);
    expect(client.expire).toHaveBeenCalledWith('key', 3600);
  });

  it('rejects once the count exceeds the limit', async () => {
    const client = { incr: jest.fn().mockResolvedValue(11), expire: jest.fn() };
    const service = new RateLimitService(makeRedis(client) as any);

    expect(await service.consume('key', 10, 3600)).toBe(false);
  });

  it('fails OPEN (allows the request) if Redis is unreachable, rather than blocking everything', async () => {
    const client = { incr: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), expire: jest.fn() };
    const service = new RateLimitService(makeRedis(client) as any);

    expect(await service.consume('key', 10, 3600)).toBe(true);
  });
});
