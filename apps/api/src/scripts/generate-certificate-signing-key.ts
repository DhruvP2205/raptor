// Generates a fresh Ed25519 keypair and prints the private key as a
// hex-encoded PKCS8 DER string — the exact format
// CertificateSigningService expects in CERTIFICATE_SIGNING_KEY (Module
// 12, docs/stages/12-certificates.md Section 5). Unlike APP_SECRET or
// GITHUB_TOKEN_KEY, a plain `openssl rand -hex 32` does not produce a
// valid Ed25519 key, so this project provides its own generator rather
// than documenting an equivalent openssl incantation.
//
// Run directly with `node`/`ts-node`, not through the Nest app:
//
//   pnpm --filter @raptor/api exec ts-node -T \
//     src/scripts/generate-certificate-signing-key.ts

import { generateKeyPairSync } from 'crypto';

function main(): void {
  const { privateKey } = generateKeyPairSync('ed25519');
  const hex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex');
  console.log(hex);
}

main();
