import { existsSync, readFileSync } from 'fs';

// Reads the SMTP-credentials and app-secret Docker Compose secrets
// (mounted at /run/secrets/<name>, per docs/ARCHITECTURE.md Section 5)
// into process.env at process startup, before any other module can read
// them. Must be called as the first statement in main.ts.
//
// DATABASE_URL is deliberately NOT handled here. It's needed by two
// separate OS processes in the runtime container — the `prisma migrate
// deploy` step and this Node app — and only one of them can run this
// TypeScript module, so docker-entrypoint.sh is the single place that
// constructs it from the same secret, before either process starts.
// Keeping one formula in one place (the shell script) avoids the two
// processes silently drifting onto different DATABASE_URLs. For
// non-Docker local dev, set DATABASE_URL directly in .env — see
// .env.example.
//
// Never required outside Docker: if the secret file isn't present,
// this is a silent no-op.

const SECRETS_DIR = '/run/secrets';

function readSecret(name: string): string | null {
  const path = `${SECRETS_DIR}/${name}`;
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8').trim();
}

export function loadSecrets(): void {
  const smtp = readSecret('smtp_credentials');
  if (smtp) {
    for (const line of smtp.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = `SMTP_${trimmed.slice(0, eq).trim().toUpperCase()}`;
      if (!process.env[key]) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  }

  if (!process.env.APP_SECRET) {
    const appSecret = readSecret('app_secret');
    if (appSecret) {
      process.env.APP_SECRET = appSecret;
    }
  }
}
