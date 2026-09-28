import { generateKeyPairSync } from 'crypto';
import { CertificateSigningService } from './certificate-signing.service';

function freshKeyHex(): string {
  // Real Ed25519 PKCS8 DER, generated fresh per test rather than
  // hardcoded, so nothing depends on a specific key ever being "the" key.
  const { privateKey } = generateKeyPairSync('ed25519');
  return privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex');
}

describe('CertificateSigningService', () => {
  const originalKey = process.env.CERTIFICATE_SIGNING_KEY;

  afterEach(() => {
    process.env.CERTIFICATE_SIGNING_KEY = originalKey;
  });

  it('verifies a signature it just produced for the same payload', () => {
    process.env.CERTIFICATE_SIGNING_KEY = freshKeyHex();
    const service = new CertificateSigningService();
    const payload = { recipientName: 'Ada Lovelace', role: 'PARTICIPANT' };

    const { signature, publicKeyId } = service.sign(payload);

    expect(service.verify(payload, signature, publicKeyId)).toBe(true);
  });

  it('is robust to key-order differences from a jsonb round trip (canonicalization)', () => {
    process.env.CERTIFICATE_SIGNING_KEY = freshKeyHex();
    const service = new CertificateSigningService();
    const payload = { a: 1, b: 2, nested: { x: 1, y: 2 } };
    const { signature, publicKeyId } = service.sign(payload);

    const reordered = { nested: { y: 2, x: 1 }, b: 2, a: 1 };
    expect(service.verify(reordered, signature, publicKeyId)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    process.env.CERTIFICATE_SIGNING_KEY = freshKeyHex();
    const service = new CertificateSigningService();
    const { signature, publicKeyId } = service.sign({ role: 'PARTICIPANT' });

    expect(service.verify({ role: 'WINNER' }, signature, publicKeyId)).toBe(false);
  });

  it('rejects a signature claimed against a publicKeyId that is not the currently-configured key', () => {
    process.env.CERTIFICATE_SIGNING_KEY = freshKeyHex();
    const service = new CertificateSigningService();
    const payload = { role: 'PARTICIPANT' };
    const { signature } = service.sign(payload);

    expect(service.verify(payload, signature, 'not-the-real-key-id')).toBe(false);
  });

  it('throws if CERTIFICATE_SIGNING_KEY is not configured', () => {
    delete process.env.CERTIFICATE_SIGNING_KEY;
    const service = new CertificateSigningService();
    expect(() => service.sign({ a: 1 })).toThrow(/CERTIFICATE_SIGNING_KEY/);
  });
});
