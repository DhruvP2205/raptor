import { hmacSha256Hex } from '../common/crypto.util';
import { SessionService } from './session.service';

function makePrisma() {
  return {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

const ORIGINAL_APP_SECRET = process.env.APP_SECRET;

afterEach(() => {
  if (ORIGINAL_APP_SECRET === undefined) {
    delete process.env.APP_SECRET;
  } else {
    process.env.APP_SECRET = ORIGINAL_APP_SECRET;
  }
});

describe('SessionService ipHash', () => {
  it('stores an HMAC-keyed hash of the IP when APP_SECRET is configured', async () => {
    process.env.APP_SECRET = 'test-secret';
    const prisma = makePrisma();
    const service = new SessionService(prisma as any);

    const req = {
      headers: {},
      ip: '203.0.113.42',
    } as any;
    const res = { cookie: jest.fn() } as any;

    await service.createSession('user-1', req, res);

    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipHash: hmacSha256Hex('203.0.113.42', 'test-secret'),
        }),
      }),
    );
  });

  it('never falls back to an unkeyed hash when APP_SECRET is missing — stores null instead', async () => {
    delete process.env.APP_SECRET;
    const prisma = makePrisma();
    const service = new SessionService(prisma as any);

    const req = {
      headers: {},
      ip: '203.0.113.42',
    } as any;
    const res = { cookie: jest.fn() } as any;

    await service.createSession('user-1', req, res);

    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ipHash: null }),
      }),
    );
  });
});
