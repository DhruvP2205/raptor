import { existsSync, readFileSync } from 'fs';

// Reads Docker Compose secrets (mounted at /run/secrets/<name>, per
// docs/ARCHITECTURE.md Section 5) into process.env at process startup,
// before any other module — notably before Prisma Client is
// instantiated — can read them. Must be called as the first statement
// in main.ts, ahead of any import with a module-instantiation side
// effect.
//
// Never enabled/required in non-Docker local dev: if the secret files
// aren't present (e.g. DATABASE_URL is already set directly in .env),
// this is a silent no-op.

const SECRETS_DIR = '/run/secrets';

function readSecret(name: string): string | null {
  const path = `${SECRETS_DIR}/${name}`;
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8').trim();
}

export function loadSecrets(): void {
  if (!process.env.DATABASE_URL) {
    const password = readSecret('postgres_password');
    if (password) {
      const user = process.env.POSTGRES_USER ?? 'raptor';
      const db = process.env.POSTGRES_DB ?? 'raptor';
      const host = process.env.POSTGRES_HOST ?? 'postgres';
      const port = process.env.POSTGRES_PORT ?? '5432';
      process.env.DATABASE_URL = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
    }
  }

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
}
