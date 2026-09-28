import 'dotenv/config';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { FixturesFile, importFixtures, issueSession } from './fixtures-import';

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

    const organizerToken = await issueSession(prisma, result.organizerUserId);
    const judgeAToken = await issueSession(prisma, result.judgeUserIds[0]);
    const judgeBToken = await issueSession(prisma, result.judgeUserIds[1]);
    const participantToken = result.firstParticipantUserId
      ? await issueSession(prisma, result.firstParticipantUserId)
      : null;

    console.log('\n=== Fixture import complete ===');
    console.log(`Event: ${result.eventSlug} (id=${result.eventId})`);
    console.log('\n=== Seed-time auth headers (D169) — attach verbatim, checker never logs in ===');
    console.log(`organizer:   Cookie: raptor_session=${organizerToken}`);
    console.log(`judge_a:     Cookie: raptor_session=${judgeAToken}`);
    console.log(`judge_b:     Cookie: raptor_session=${judgeBToken}`);
    console.log(
      participantToken
        ? `participant: Cookie: raptor_session=${participantToken}`
        : 'participant: <no team members found in fixture>',
    );
    console.log('\n=== Route values for .dogfood.toml ===');
    console.log(`gallery       = /events/${result.eventId}/submissions`);
    console.log(`submit        = /submissions/${result.firstTeamSubmissionId}/submit`);
    console.log(`judge_scores  = /assignments/${result.sampleAssignmentId ?? '<judge_a has no scored assignment>'}`);
    console.log(`peer_scores   = /assignments/${result.sampleAssignmentId ?? '<judge_a has no scored assignment>'}  (same URL — judge_b's header on this route is the check)`);
    console.log(`csv_export    = /events/${result.eventId}/export/submissions.csv`);

    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exitCode = code;
});
