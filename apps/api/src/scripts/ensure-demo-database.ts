import 'dotenv/config';

import { Prisma, PrismaClient } from '@prisma/client';

// Module 20 (docs/design/20-demo-environment.md Section 4) — Postgres
// has no `CREATE DATABASE IF NOT EXISTS`, and `prisma migrate deploy`
// assumes its target database already exists rather than creating one.
// This connects to the server's always-present `postgres` maintenance
// database (never the app's own — that's exactly the database this
// script might need to create) and issues a plain `CREATE DATABASE`,
// treating "already exists" (Postgres error code 42P04) as success,
// not a failure — this script is meant to be re-run on every boot.
//
// Run directly with `node`, before `prisma migrate deploy`:
//   node dist/scripts/ensure-demo-database.js

export function parseDatabaseUrl(url: string): { adminUrl: string; targetDbName: string } {
  const parsed = new URL(url);
  const targetDbName = parsed.pathname.replace(/^\//, '');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  return { adminUrl: adminUrl.toString(), targetDbName };
}

// Defense in depth: the caller is about to interpolate this into a raw,
// unparameterized DDL statement (Postgres has no parameterized `CREATE
// DATABASE`) — refusing anything but a plain identifier is cheap
// insurance against this ever being fed anything else.
export function isSafeDatabaseIdentifier(name: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(name);
}

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[ensure-demo-database] DATABASE_URL is not set.');
    return 1;
  }

  const { adminUrl, targetDbName } = parseDatabaseUrl(databaseUrl);
  if (!isSafeDatabaseIdentifier(targetDbName)) {
    console.error(`[ensure-demo-database] Refusing unexpected database name: ${targetDbName}`);
    return 1;
  }

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${targetDbName}"`);
    console.log(`[ensure-demo-database] Created database "${targetDbName}".`);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010' && /already exists/.test(String((err.meta as any)?.message))) {
      console.log(`[ensure-demo-database] Database "${targetDbName}" already exists — nothing to do.`);
    } else {
      throw err;
    }
  } finally {
    await admin.$disconnect();
  }
  return 0;
}

// Only runs when executed directly (`node dist/scripts/
// ensure-demo-database.js`), not when imported for its pure functions
// (ensure-demo-database.spec.ts) — without this guard, importing this
// module for testing would also fire off a real database connection as
// a side effect of module load.
if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
