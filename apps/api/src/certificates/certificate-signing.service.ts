import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'crypto';
import { canonicalJsonStringify } from '../common/canonical-json.util';

// Ed25519 signing over Certificate.payloadJson (D34,
// docs/stages/12-certificates.md Section 5). The key is a PKCS8 DER
// -encoded Ed25519 private key, hex-encoded for the same single-line,
// `openssl`-friendly secret convention as APP_SECRET/GITHUB_TOKEN_KEY —
// generate with `pnpm --filter @raptor/api exec ts-node -T
// src/scripts/generate-certificate-signing-key.ts` (Ed25519 keys can't
// be produced by a plain `openssl rand`, unlike those two).
//
// Single active key, no rotation registry — publicKeyId is a
// fingerprint of the currently-configured key, stored per certificate
// so a future rotation feature could recognize which key era issued it,
// but this service can only ever verify against the one key it's
// currently configured with.
@Injectable()
export class CertificateSigningService {
  private cached: { privateKey: KeyObject; publicKey: KeyObject; publicKeyId: string } | null = null;

  sign(payload: unknown): { signature: string; publicKeyId: string } {
    const { privateKey, publicKeyId } = this.getKeys();
    const data = Buffer.from(canonicalJsonStringify(payload), 'utf8');
    const signature = sign(null, data, privateKey);
    return { signature: signature.toString('base64'), publicKeyId };
  }

  // Recomputes the canonical form of `payload` fresh and checks it
  // against `signature` — never trusts a stored "verified" flag, since
  // there isn't one; verification is always live (Section 6).
  verify(payload: unknown, signature: string, publicKeyId: string): boolean {
    const { publicKey, publicKeyId: currentKeyId } = this.getKeys();
    if (publicKeyId !== currentKeyId) return false;
    try {
      const data = Buffer.from(canonicalJsonStringify(payload), 'utf8');
      return verify(null, data, publicKey, Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }

  private getKeys(): { privateKey: KeyObject; publicKey: KeyObject; publicKeyId: string } {
    if (this.cached) return this.cached;

    const hexKey = process.env.CERTIFICATE_SIGNING_KEY;
    if (!hexKey) {
      // No safe degraded mode for a signature this service is about to
      // issue — fail loud, same precedent as GithubTokensService.
      throw new InternalServerErrorException(
        'CERTIFICATE_SIGNING_KEY is not configured — cannot issue or verify certificates without a signing key.',
      );
    }

    const privateKey = createPrivateKey({ key: Buffer.from(hexKey, 'hex'), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    const publicKeyId = createHash('sha256')
      .update(publicKey.export({ format: 'der', type: 'spki' }))
      .digest('hex')
      .slice(0, 16);

    this.cached = { privateKey, publicKey, publicKeyId };
    return this.cached;
  }
}
