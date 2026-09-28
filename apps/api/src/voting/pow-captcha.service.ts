import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { sha256Hex } from '../common/crypto.util';
import { RedisService } from '../redis/redis.service';

const POW_TTL_SECONDS = 5 * 60;
const CAPTCHA_TTL_SECONDS = 5 * 60;
// Roughly ~2^20 average attempts — imperceptible to a browser (well
// under a second of CPU), but a real, non-trivial cost to pay per vote
// at scale (Section 5.1, docs/stages/11-voting.md).
const DEFAULT_DIFFICULTY_BITS = Number(process.env.VOTE_POW_DIFFICULTY_BITS ?? 20);

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — ambiguous to read

function countLeadingZeroBits(hex: string): number {
  let bits = 0;
  for (const char of hex) {
    const nibble = parseInt(char, 16);
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    // Count leading zero bits within this nibble, then stop.
    bits += Math.clz32(nibble) - 28;
    break;
  }
  return bits;
}

// Self-built proof-of-work + adaptive visible CAPTCHA — see
// docs/ARCHITECTURE.md §2 ("no third-party service call"). Both use
// Redis for short-lived, single-use challenge storage, same pattern the
// doc anticipates (§2's tech-stack table).
//
// Fail-open on a genuine Redis outage, fail-closed on anything else
// (missing/expired/already-consumed/wrong-answer) — same distinction
// RateLimitService draws for itself: this is anti-abuse, not
// authorization. Losing the PoW/CAPTCHA gate during an infra outage is
// an acceptable trade-off; a missing or wrong answer is not.
@Injectable()
export class PowCaptchaService {
  private readonly logger = new Logger(PowCaptchaService.name);

  constructor(private readonly redis: RedisService) {}

  async issuePowChallenge(): Promise<{ challengeId: string; challenge: string; difficultyBits: number }> {
    const challengeId = randomBytes(16).toString('hex');
    const challenge = randomBytes(16).toString('hex');
    try {
      await this.redis.client.set(`vote-pow:${challengeId}`, challenge, 'EX', POW_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Failed to store PoW challenge (failing open at verify time): ${(err as Error).message}`);
    }
    return { challengeId, challenge, difficultyBits: DEFAULT_DIFFICULTY_BITS };
  }

  async verifyAndConsumePow(challengeId: string, nonce: string): Promise<boolean> {
    const key = `vote-pow:${challengeId}`;
    let challenge: string | null;
    try {
      challenge = await this.redis.client.get(key);
      await this.redis.client.del(key); // single-use regardless of outcome
    } catch (err) {
      this.logger.warn(`PoW verification failed (failing open): ${(err as Error).message}`);
      return true;
    }
    if (!challenge) return false; // missing/expired/already-consumed — fail closed

    const digest = sha256Hex(`${challenge}:${nonce}`);
    return countLeadingZeroBits(digest) >= DEFAULT_DIFFICULTY_BITS;
  }

  // Adaptive — VotingService only calls this path when the abuse-signal
  // score for this vote is already elevated (Section 5.1). Returns an
  // inline SVG (no external renderer, no third-party image service).
  async issueCaptchaChallenge(): Promise<{ challengeId: string; svg: string }> {
    const code = Array.from({ length: 6 }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join('');
    const challengeId = randomBytes(16).toString('hex');
    try {
      await this.redis.client.set(`vote-captcha:${challengeId}`, code, 'EX', CAPTCHA_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Failed to store CAPTCHA challenge (failing open at verify time): ${(err as Error).message}`);
    }
    return { challengeId, svg: renderCaptchaSvg(code) };
  }

  async verifyAndConsumeCaptcha(challengeId: string, answer: string): Promise<boolean> {
    const key = `vote-captcha:${challengeId}`;
    let code: string | null;
    try {
      code = await this.redis.client.get(key);
      await this.redis.client.del(key);
    } catch (err) {
      this.logger.warn(`CAPTCHA verification failed (failing open): ${(err as Error).message}`);
      return true;
    }
    if (!code) return false;
    return code.toUpperCase() === answer.trim().toUpperCase();
  }
}

// Pure-JS inline SVG, no headless browser / canvas / font rendering —
// per-character rotation and jitter plus a couple of noise lines is
// enough to defeat a naive OCR/regex scrape without needing a real
// image library.
function renderCaptchaSvg(code: string): string {
  const width = 160;
  const height = 60;
  const glyphs = code
    .split('')
    .map((char, i) => {
      const x = 15 + i * 24 + randomInt(-3, 4);
      const y = 38 + randomInt(-4, 5);
      const rotation = randomInt(-25, 26);
      const hue = randomInt(0, 360);
      return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})" font-size="28" font-family="monospace" font-weight="bold" fill="hsl(${hue},55%,35%)">${char}</text>`;
    })
    .join('');
  const noiseLines = Array.from({ length: 4 }, () => {
    const x1 = randomInt(0, width);
    const y1 = randomInt(0, height);
    const x2 = randomInt(0, width);
    const y2 = randomInt(0, height);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="hsl(${randomInt(0, 360)},40%,70%)" stroke-width="1.5" />`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f3f0e8" />${noiseLines}${glyphs}</svg>`;
}
