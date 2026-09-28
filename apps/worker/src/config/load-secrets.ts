import { existsSync, readFileSync } from 'node:fs';

// Mirrors apps/api/src/config/load-secrets.ts's pattern (same Docker
// secrets mount, same silent-no-op-outside-Docker behavior) — kept as
// its own small copy rather than a shared import because this worker
// only ever needs one of the several secrets that file loads. See that
// file's comment for the full rationale on why DATABASE_URL is handled
// by docker-entrypoint.sh instead of here, which applies identically to
// this app's own entrypoint.
const SECRETS_DIR = '/run/secrets';

function readSecret(name: string): string | null {
  const path = `${SECRETS_DIR}/${name}`;
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8').trim();
}

export function loadSecrets(): void {
  if (!process.env.GITHUB_TOKEN_KEY) {
    const githubTokenKey = readSecret('github_token_key');
    if (githubTokenKey) {
      process.env.GITHUB_TOKEN_KEY = githubTokenKey;
    }
  }
}
