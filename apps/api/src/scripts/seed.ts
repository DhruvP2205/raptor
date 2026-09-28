import 'dotenv/config';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  AuthHeaderRole,
  issueOrReuseRoleSession,
  readPreviousAuthHeaders,
  writeAuthHeadersFile,
} from './auth-header-bootstrap';
import { FixturesFile, importFixtures } from './fixtures-import';

// D171, docs/DECISIONS.md / docs/design/16-fixtures-import.md Section 2
// — the seed entrypoint the design doc assumes already existed. Runs the
// fixtures importer on every boot (idempotent — see
// FixtureImportRecord). Does NOT build the "rich demo event for a human
// judge" the doc describes as already built elsewhere; that's a real,
// separate, not-yet-designed gap, flagged rather than invented here.
//
// Invoked directly as a compiled script, not through Prisma's own
// `db seed` CLI wrapper — this project's established convention is
// "compile via `nest build`, run via `node dist/scripts/*.js`" (see
// bootstrap-admin.ts, import-fixtures.ts's predecessor), and adding a
// second, ts-node/tsx-based execution path for one script would be more
// machinery than the gap being filled here. docker-entrypoint.sh calls
// this directly after `prisma migrate deploy`.
//
// Run directly with `node`:
//   node dist/scripts/seed.js
// Fixture file path defaults to the committed apps/api/prisma/fixtures.json
// (documented path, Section 2); override with FIXTURES_PATH for a
// different file (e.g. the organizers' real file at kickoff, if it ever
// differs from what's already committed).

function defaultFixturesPath(): string {
  return join(__dirname, '../../prisma/fixtures.json');
}

function authHeadersFilePath(): string {
  return join(__dirname, '../../.fixture-auth-headers.txt');
}

async function main(): Promise<number> {
  const fixturesPath = process.env.FIXTURES_PATH ?? defaultFixturesPath();
  if (!existsSync(fixturesPath)) {
    console.log(`[seed] No fixtures file at ${fixturesPath} — skipping fixtures import.`);
    return 0;
  }

  const fixtures: FixturesFile = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  if (!fixtures.judges || fixtures.judges.length < 2) {
    console.error('[seed] fixtures.json must include at least 2 judges (for judge_a/judge_b).');
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    const result = await importFixtures(prisma, fixtures);

    // Module 17 (D169/D171, docs/design/17-auth-header-bootstrap.md) —
    // reuses each role's previously-issued session (if still valid)
    // rather than silently rotating a token a human already copied
    // into .dogfood.toml. The file is the only place a raw token
    // survives between runs — Session only ever stores its hash.
    const headersFile = authHeadersFilePath();
    const previousHeaders = readPreviousAuthHeaders(headersFile);
    const roleUserIds: Record<AuthHeaderRole, string | null> = {
      organizer: result.organizerUserId,
      judge_a: result.judgeUserIds[0] ?? null,
      judge_b: result.judgeUserIds[1] ?? null,
      participant: result.firstParticipantUserId || null,
    };

    const sessionResults = await Promise.all(
      (['organizer', 'judge_a', 'judge_b', 'participant'] as const).map(async (role) => {
        const userId = roleUserIds[role];
        if (!userId) return { role, headerValue: null, reused: false };
        return issueOrReuseRoleSession(prisma, role, userId, previousHeaders);
      }),
    );

    const headerByRole = Object.fromEntries(
      sessionResults.map((r) => [r.role, r.headerValue ?? '<no user found in fixture for this role>']),
    ) as Record<AuthHeaderRole, string>;
    writeAuthHeadersFile(headersFile, headerByRole);

    console.log('\n=== Fixture import complete ===');
    console.log(`Event: ${result.eventSlug} (id=${result.eventId})`);
    console.log(`\n=== Seed-time auth headers (D169) — attach verbatim, checker never logs in ===`);
    console.log(`(also written to ${headersFile})`);
    for (const r of sessionResults) {
      const suffix = r.headerValue ? (r.reused ? '  [reused from prior run]' : '  [freshly issued]') : '';
      console.log(`${r.role}: ${r.headerValue ?? '<no user found in fixture for this role>'}${suffix}`);
    }
    // Module 19 (docs/design/19-dogfood-toml.md) — judge_scores/
    // peer_scores now point at the dedicated (submissionId, judgeId)
    // audit route, not the old assignment-id-keyed one. Same URL for
    // both, by design (D170) — the check is which judge's header is
    // attached, not a different route.
    const judgeAId = result.judgeUserIds[0];
    const auditRoute =
      result.sampleSubmissionIdForAudit && judgeAId
        ? `/submissions/${result.sampleSubmissionIdForAudit}/judges/${judgeAId}/scores`
        : '<judge_a has no scored assignment>';
    console.log('\n=== Route values for .dogfood.toml ===');
    console.log(`gallery       = /events/${result.eventId}/submissions`);
    console.log(`submit        = /submissions/${result.firstTeamSubmissionId}/submit`);
    console.log(`judge_scores  = ${auditRoute}`);
    console.log(`peer_scores   = ${auditRoute}  (same URL — judge_b's header on this route is the check)`);
    console.log(`csv_export    = /events/${result.eventId}/export/submissions.csv`);

    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exitCode = code;
});
