import { createHash } from 'crypto';
import { PowCaptchaService } from './pow-captcha.service';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    client: {
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
    },
    __store: store,
  } as any;
}

function solve(challenge: string, difficultyBits: number): string {
  let nonce = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest('hex');
    let bits = 0;
    for (const char of digest) {
      const nibble = parseInt(char, 16);
      if (nibble === 0) {
        bits += 4;
        continue;
      }
      bits += Math.clz32(nibble) - 28;
      break;
    }
    if (bits >= difficultyBits) return String(nonce);
    nonce += 1;
  }
}

describe('PowCaptchaService', () => {
  describe('proof-of-work (Section 5.1)', () => {
    it('accepts a correctly-solved nonce exactly once, then rejects replay (single-use)', async () => {
      const redis = makeRedis();
      const service = new PowCaptchaService(redis);
      const { challengeId, challenge, difficultyBits } = await service.issuePowChallenge();
      const nonce = solve(challenge, difficultyBits);

      expect(await service.verifyAndConsumePow(challengeId, nonce)).toBe(true);
      expect(await service.verifyAndConsumePow(challengeId, nonce)).toBe(false); // consumed
    });

    it('rejects an unsolved/incorrect nonce', async () => {
      const redis = makeRedis();
      const service = new PowCaptchaService(redis);
      const { challengeId } = await service.issuePowChallenge();

      expect(await service.verifyAndConsumePow(challengeId, 'not-a-real-solution')).toBe(false);
    });

    it('rejects a challengeId that was never issued', async () => {
      const redis = makeRedis();
      const service = new PowCaptchaService(redis);

      expect(await service.verifyAndConsumePow('never-issued', '0')).toBe(false);
    });

    it('fails OPEN (accepts) when Redis is unreachable at verify time — anti-abuse, not authorization', async () => {
      const redis = makeRedis();
      redis.client.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new PowCaptchaService(redis);

      expect(await service.verifyAndConsumePow('any-id', 'any-nonce')).toBe(true);
    });
  });

  describe('adaptive CAPTCHA (Section 5.1)', () => {
    it('accepts the correct answer case-insensitively, exactly once', async () => {
      const redis = makeRedis();
      const service = new PowCaptchaService(redis);
      const { challengeId } = await service.issueCaptchaChallenge();
      const storedCode = [...redis.__store.values()][0];

      expect(await service.verifyAndConsumeCaptcha(challengeId, storedCode.toLowerCase())).toBe(true);
      expect(await service.verifyAndConsumeCaptcha(challengeId, storedCode)).toBe(false); // consumed
    });

    it('rejects a wrong answer', async () => {
      const redis = makeRedis();
      const service = new PowCaptchaService(redis);
      const { challengeId } = await service.issueCaptchaChallenge();

      expect(await service.verifyAndConsumeCaptcha(challengeId, 'WRONGCODE')).toBe(false);
    });

    it('fails OPEN when Redis is unreachable at verify time', async () => {
      const redis = makeRedis();
      redis.client.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new PowCaptchaService(redis);

      expect(await service.verifyAndConsumeCaptcha('any-id', 'anything')).toBe(true);
    });

    it('renders a self-contained inline SVG with no external references', async () => {
      const redis = makeRedis();
      const service = new PowCaptchaService(redis);
      const { svg } = await service.issueCaptchaChallenge();

      expect(svg).toMatch(/^<svg/);
      // http://www.w3.org/2000/svg is the required XML namespace
      // declaration, not a fetched resource — what actually matters is
      // that nothing loads external content (an <image>, a linked
      // stylesheet/font, an xlink:href to a URL).
      expect(svg).not.toMatch(/<image|xlink:href|@import/);
    });
  });
});
