import 'dotenv/config';

import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { normalizeEmail } from '../common/email.util';

// Bootstraps a siteAdmin account — the ONLY way one is ever created, by
// design. Section 2.4 of docs/stages/02-roles-and-membership.md: "there
// is no in-app 'create a site admin' button, since that would be a
// privilege escalation surface with no legitimate normal-operation use
// case." Run directly with `node`, not through the Nest app — this is a
// standalone CLI entry point.
//
// Docker:
//   docker compose run --rm -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... \
//     api node dist/scripts/bootstrap-admin.js
//
// Non-Docker local dev (reads apps/api/.env via dotenv):
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
//     pnpm --filter @raptor/api exec node dist/scripts/bootstrap-admin.js

async function main(): Promise<number> {
  const email = process.env.ADMIN_EMAIL
    ? normalizeEmail(process.env.ADMIN_EMAIL)
    : undefined;
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? 'Site Admin';

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set.');
    return 1;
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error(
        `A user with email ${email} already exists (id=${existing.id}). Refusing to overwrite — delete it first if you really mean to replace it.`,
      );
      return 1;
    }

    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        // Inert for a siteAdmin — EventRoleGuard's bypass checks
        // req.user.siteAdmin, never accountType. ORGANIZER is just the
        // closest semantic fit for an operator account; see D59 in
        // docs/DECISIONS.md.
        accountType: 'ORGANIZER',
        siteAdmin: true,
      },
    });

    console.log(`Created siteAdmin user ${user.email} (id=${user.id}).`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exitCode = code;
});
