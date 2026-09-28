import type { PrismaClient } from '@prisma/client';
import { generateRawToken, sha256Hex } from '../common/crypto.util';
import { normalizeEmail } from '../common/email.util';
import { slugify } from '../common/slugify.util';

// D167/D171, docs/design/16-fixtures-import.md — the acceptance
// checker's fixtures importer. Direct-write only: deliberately bypasses
// Module 6's verification pipeline and Module 7's assignment-creation
// service (Section 1/5 of that doc) — fixture repo URLs are fake and the
// checker's environment has no network access.
//
// Pure helpers first (unit-tested in fixtures-import.spec.ts without a
// database), the DB-touching orchestrator (importFixtures) after.

export interface FixtureTrack {
  id: string;
  name: string;
}
export interface FixtureJudge {
  id: string;
  name: string;
  email: string;
  tracks?: string[];
}
export interface FixtureTeam {
  id: string;
  name: string;
  members: string[];
}
export interface FixtureProject {
  id: string;
  team: string;
  track?: string;
  title: string;
  summary?: string;
  repo_url?: string;
  submitted_at: string;
}
export interface FixtureScore {
  judge: string;
  project: string;
  criteria: Record<string, number>;
  comment?: string;
}
export interface FixturesFile {
  event: { id: string; name: string; submissions_close: string };
  tracks?: FixtureTrack[];
  judges: FixtureJudge[];
  teams: FixtureTeam[];
  projects: FixtureProject[];
  scores: FixtureScore[];
}

export const SYNTHESIZED_PLACEHOLDER = 'synthesized — not provided by fixture';

// Section 4b — when N projects share the same team, only one Submission
// row is ever materialized: the one with the latest submitted_at. This
// already generalizes past the exactly-two case the real file happens to
// exercise (Section 7's own noted follow-up).
export function pickKeptProject(projectsForTeam: FixtureProject[]): {
  kept: FixtureProject;
  discarded: FixtureProject[];
} {
  const sorted = [...projectsForTeam].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );
  return { kept: sorted[0], discarded: sorted.slice(1) };
}

// Section 4b — per judge, if a collapsed team's discarded AND kept
// project both carry a score from the same judge, only the kept
// project's score-set survives. A judge who only scored one of the two
// is unaffected either way.
export function dedupScoresForTeam(
  scoresForTeam: FixtureScore[],
  keptProjectId: string,
): FixtureScore[] {
  const byJudge = new Map<string, FixtureScore[]>();
  for (const s of scoresForTeam) {
    const list = byJudge.get(s.judge) ?? [];
    list.push(s);
    byJudge.set(s.judge, list);
  }
  const result: FixtureScore[] = [];
  for (const list of byJudge.values()) {
    if (list.length === 1) {
      result.push(list[0]);
      continue;
    }
    const kept = list.find((s) => s.project === keptProjectId);
    result.push(kept ?? list[0]);
  }
  return result;
}

// Section 4a — team names aren't guaranteed unique in the fixture (the
// real file has three), but Team.name IS a real DB-level unique
// constraint scoped to the event (`@@unique([eventId, name])`,
// apps/api/prisma/schema.prisma) — see D172, docs/DECISIONS.md, for why
// this doc's own Section 4a is corrected rather than taken at face value
// (it assumed no DB constraint existed; one does, predating this
// module). The importer works around it here rather than loosening
// Module 4's already-shipped uniqueness guarantee for real users.
export function disambiguateTeamName(name: string, alreadyUsedInEvent: Set<string>): string {
  if (!alreadyUsedInEvent.has(name)) return name;
  let n = 2;
  while (alreadyUsedInEvent.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

// Section 4c — read whichever criterion keys actually appear, weight
// split evenly and summing to exactly 100 regardless of count (D114's
// sum-to-100 rule) — never hardcoded to today's three-key file.
export function splitWeightsEvenly(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + remainder : base));
}

// Section 4c — clamp rather than reject; Score.value's real range is
// 0-100 (Score model comment) and must be a schema-legal Int.
export function clampScoreValue(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

// The fixture gives team members as bare email strings, no display name
// — TODO: undocumented decision, needs confirmation. Section 3's table
// doesn't cover this gap (the fixture format simply has no name field
// for team members, unlike judges which do). Smallest reasonable
// interpretation: humanize the email's local part rather than leave
// User.displayName empty (it's a required column) or use the raw email
// as a name.
export function humanizeEmailLocalPart(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export interface ImportResult {
  eventId: string;
  eventSlug: string;
  organizerUserId: string;
  judgeUserIds: string[];
  firstParticipantUserId: string;
  firstTeamSubmissionId: string;
  sampleAssignmentId: string | null;
}

const DEMO_ORGANIZER_EMAIL = 'demo.organizer@raptor.local';
const DEMO_ORGANIZER_NAME = 'Demo Organizer';

async function randomPasswordHash(): Promise<string> {
  const argon2 = await import('argon2');
  // Never used to log in — reached only via seed-printed sessions.
  return argon2.hash(generateRawToken());
}

async function getOrCreateRecord(
  prisma: PrismaClient,
  fixtureType: string,
  fixtureId: string,
  create: () => Promise<string>,
): Promise<{ internalId: string; wasCreated: boolean }> {
  const existing = await prisma.fixtureImportRecord.findUnique({
    where: { fixtureType_fixtureId: { fixtureType, fixtureId } },
  });
  if (existing) return { internalId: existing.internalId, wasCreated: false };

  const internalId = await create();
  await prisma.fixtureImportRecord.create({
    data: { fixtureType, fixtureId, internalId },
  });
  return { internalId, wasCreated: true };
}

// D171, docs/DECISIONS.md — no general demo-seed exists yet in this
// codebase to supply the "existing seeded demo-organizer account" this
// module's own design doc (Section 3) assumes. Flagged rather than
// silently worked around: this creates the one minimal, fixed-identity
// organizer account Module 16 itself needs, not the broader "rich demo
// event for a human judge" the doc describes as already built elsewhere
// — that remains a real, separate gap.
async function getOrCreateDemoOrganizer(prisma: PrismaClient): Promise<string> {
  const email = normalizeEmail(DEMO_ORGANIZER_EMAIL);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await randomPasswordHash(),
      displayName: DEMO_ORGANIZER_NAME,
      accountType: 'ORGANIZER',
      emailVerifiedAt: new Date(),
    },
    update: {},
  });
  return user.id;
}

export async function importFixtures(
  prisma: PrismaClient,
  fixtures: FixturesFile,
): Promise<ImportResult> {
  const now = Date.now();

  // --- Event ---
  const { internalId: eventInternalId } = await getOrCreateRecord(
    prisma,
    'event',
    fixtures.event.id,
    async () => {
      const slug = slugify(fixtures.event.name);
      // Section 3 — submissionsCloseAt MUST land in the past; the real
      // file's own value already does (2026-03), but this stays correct
      // even if a future fixture revision's date doesn't.
      const fixtureClose = new Date(fixtures.event.submissions_close).getTime();
      const submissionsCloseAt = new Date(Math.min(fixtureClose || now - 60_000, now - 60_000));
      const event = await prisma.event.create({
        data: {
          name: fixtures.event.name,
          slug,
          status: 'PUBLISHED',
          registrationOpensAt: new Date(submissionsCloseAt.getTime() - 120 * 60_000),
          registrationClosesAt: new Date(submissionsCloseAt.getTime() - 90 * 60_000),
          eventStartsAt: new Date(submissionsCloseAt.getTime() - 60 * 60_000),
          submissionsOpenAt: new Date(submissionsCloseAt.getTime() - 45 * 60_000),
          submissionsCloseAt,
          eventEndsAt: new Date(submissionsCloseAt.getTime() + 5 * 60_000),
          // "judging already underway" (Section 3) — in the future so
          // judge_scores/peer_scores reads stay reachable regardless of
          // when the checker actually runs.
          judgingClosesAt: new Date(now + 24 * 60 * 60_000),
          resultsAnnounceAt: new Date(now + 30 * 60 * 60_000),
          votingOpensAt: new Date(now + 31 * 60 * 60_000),
          votingClosesAt: new Date(now + 40 * 60 * 60_000),
          votingWinnerAnnounceAt: new Date(now + 41 * 60 * 60_000),
          eventClosedAt: new Date(now + 48 * 60 * 60_000),
        },
      });
      return event.id;
    },
  );
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventInternalId } });

  // --- Organizer (Section 3 — no fixture entity; our own demo account) ---
  const organizerUserId = await getOrCreateDemoOrganizer(prisma);
  await prisma.eventMembership.upsert({
    where: { userId_eventId: { userId: organizerUserId, eventId: event.id } },
    create: { userId: organizerUserId, eventId: event.id, role: 'ORGANIZER', invitationStatus: 'ACCEPTED' },
    update: { invitationStatus: 'ACCEPTED' },
  });

  // --- Tracks ---
  const trackInternalIdByFixtureId = new Map<string, string>();
  for (const t of fixtures.tracks ?? []) {
    const { internalId } = await getOrCreateRecord(prisma, 'track', t.id, async () => {
      const track = await prisma.track.create({ data: { eventId: event.id, name: t.name } });
      return track.id;
    });
    trackInternalIdByFixtureId.set(t.id, internalId);
  }

  // --- Judges ---
  const judgeInternalIdByFixtureId = new Map<string, string>();
  for (const j of fixtures.judges) {
    const { internalId } = await getOrCreateRecord(prisma, 'judge', j.id, async () => {
      const email = normalizeEmail(j.email);
      const user = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash: await randomPasswordHash(),
          displayName: j.name,
          accountType: 'JUDGE',
          emailVerifiedAt: new Date(),
        },
        update: {},
      });
      await prisma.eventMembership.upsert({
        where: { userId_eventId: { userId: user.id, eventId: event.id } },
        create: { userId: user.id, eventId: event.id, role: 'JUDGE', invitationStatus: 'ACCEPTED' },
        update: { invitationStatus: 'ACCEPTED' },
      });
      return user.id;
    });
    judgeInternalIdByFixtureId.set(j.id, internalId);
  }

  // --- Teams + members (Section 4a — disambiguate colliding names) ---
  const teamInternalIdByFixtureId = new Map<string, string>();
  const teamNamesUsed = new Set<string>();
  let firstParticipantUserId = '';
  for (const t of fixtures.teams) {
    const { internalId } = await getOrCreateRecord(prisma, 'team', t.id, async () => {
      const memberIds: string[] = [];
      for (const email of t.members) {
        const normalized = normalizeEmail(email);
        const user = await prisma.user.upsert({
          where: { email: normalized },
          create: {
            email: normalized,
            passwordHash: await randomPasswordHash(),
            displayName: humanizeEmailLocalPart(normalized),
            accountType: 'PARTICIPANT',
            emailVerifiedAt: new Date(),
          },
          update: {},
        });
        memberIds.push(user.id);
        if (!firstParticipantUserId) firstParticipantUserId = user.id;
      }

      const finalName = disambiguateTeamName(t.name, teamNamesUsed);
      teamNamesUsed.add(finalName);

      const team = await prisma.team.create({
        data: {
          eventId: event.id,
          name: finalName,
          adminUserId: memberIds[0],
          joinLinkPrefix: slugify(finalName),
          joinLinkSuffix: generateRawToken(3),
        },
      });
      for (const userId of memberIds) {
        await prisma.teamMembership.create({ data: { teamId: team.id, userId } });
      }
      return team.id;
    });
    teamInternalIdByFixtureId.set(t.id, internalId);
    // Re-derived even on an already-imported team, so a re-run still
    // knows the stable participant identity to print.
    if (!firstParticipantUserId) {
      const firstEmail = t.members[0];
      if (firstEmail) {
        const u = await prisma.user.findUnique({ where: { email: normalizeEmail(firstEmail) } });
        if (u) firstParticipantUserId = u.id;
      }
    }
  }

  // --- Projects -> Submissions (Section 4b — collapse per team) ---
  const projectIdToTeamFixtureId = new Map<string, string>();
  const submissionInternalIdByTeamFixtureId = new Map<string, string>();
  const keptProjectIdByTeamFixtureId = new Map<string, string>();
  let firstTeamSubmissionId = '';

  const projectsByTeam = new Map<string, FixtureProject[]>();
  for (const p of fixtures.projects) {
    projectIdToTeamFixtureId.set(p.id, p.team);
    const list = projectsByTeam.get(p.team) ?? [];
    list.push(p);
    projectsByTeam.set(p.team, list);
  }

  for (const [teamFixtureId, projectsForTeam] of projectsByTeam) {
    const { kept } = pickKeptProject(projectsForTeam);
    keptProjectIdByTeamFixtureId.set(teamFixtureId, kept.id);

    const { internalId } = await getOrCreateRecord(
      prisma,
      'submission',
      teamFixtureId,
      async () => {
        const teamInternalId = teamInternalIdByFixtureId.get(teamFixtureId);
        if (!teamInternalId) throw new Error(`Unknown team fixture id in projects: ${teamFixtureId}`);
        const trackInternalId = kept.track ? trackInternalIdByFixtureId.get(kept.track) : undefined;

        const submission = await prisma.submission.create({
          data: {
            eventId: event.id,
            submissionType: 'TEAM',
            teamId: teamInternalId,
            title: kept.title,
            description: kept.summary ?? SYNTHESIZED_PLACEHOLDER,
            repoUrl: kept.repo_url ?? SYNTHESIZED_PLACEHOLDER,
            trackIds: trackInternalId ? [trackInternalId] : [],
            isDraft: false,
            everSubmitted: true,
            submittedAt: new Date(kept.submitted_at),
          },
        });
        // Section 3 — written directly, never computed; Module 6's real
        // pipeline never runs against fixture data.
        await prisma.submissionVerification.create({
          data: {
            submissionId: submission.id,
            checkStatus: 'VERIFIED',
            finalDecision: 'APPROVED',
            checkedAt: new Date(),
          },
        });
        return submission.id;
      },
    );
    submissionInternalIdByTeamFixtureId.set(teamFixtureId, internalId);
    if (!firstTeamSubmissionId) firstTeamSubmissionId = internalId;
  }

  // --- Rubric criteria (Section 4c — dynamic key set, even split) ---
  const criterionKeys = new Set<string>();
  for (const s of fixtures.scores) {
    for (const key of Object.keys(s.criteria)) criterionKeys.add(key);
  }
  const sortedKeys = [...criterionKeys].sort();
  const weights = splitWeightsEvenly(sortedKeys.length);
  const criterionInternalIdByKey = new Map<string, string>();
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const { internalId } = await getOrCreateRecord(prisma, 'criterion', key, async () => {
      const criterion = await prisma.rubricCriterion.create({
        data: {
          eventId: event.id,
          kind: 'SCORING',
          label: key,
          description: `Fixture criterion "${key}".`,
          weightPercent: weights[i],
        },
      });
      return criterion.id;
    });
    criterionInternalIdByKey.set(key, internalId);
  }

  // --- Scores -> JudgeAssignment + Score + JudgeReview + ScoreRevision ---
  const scoresByTeam = new Map<string, FixtureScore[]>();
  for (const s of fixtures.scores) {
    const teamFixtureId = projectIdToTeamFixtureId.get(s.project);
    if (!teamFixtureId) continue; // score against an unknown project — skip, not fatal
    const list = scoresByTeam.get(teamFixtureId) ?? [];
    list.push(s);
    scoresByTeam.set(teamFixtureId, list);
  }

  let sampleAssignmentId: string | null = null;
  const sampleAssignmentJudgeFixtureId = fixtures.judges[0]?.id;

  for (const [teamFixtureId, scoresForTeam] of scoresByTeam) {
    const keptProjectId = keptProjectIdByTeamFixtureId.get(teamFixtureId)!;
    const deduped = dedupScoresForTeam(scoresForTeam, keptProjectId);
    const submissionId = submissionInternalIdByTeamFixtureId.get(teamFixtureId)!;

    for (const s of deduped) {
      const judgeInternalId = judgeInternalIdByFixtureId.get(s.judge);
      if (!judgeInternalId) continue; // score from an unknown judge — skip, not fatal

      const assignmentFixtureId = `${s.judge}:${teamFixtureId}`;
      const { internalId: assignmentId } = await getOrCreateRecord(
        prisma,
        'assignment',
        assignmentFixtureId,
        async () => {
          const assignment = await prisma.judgeAssignment.create({
            data: {
              eventId: event.id,
              judgeId: judgeInternalId,
              submissionId,
              assignmentMethod: 'MANUAL',
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });

          for (const [key, rawValue] of Object.entries(s.criteria)) {
            const criterionId = criterionInternalIdByKey.get(key);
            if (!criterionId) continue;
            await prisma.score.upsert({
              where: { judgeAssignmentId_criterionId: { judgeAssignmentId: assignment.id, criterionId } },
              create: { judgeAssignmentId: assignment.id, criterionId, value: clampScoreValue(rawValue) },
              update: { value: clampScoreValue(rawValue) },
            });
          }

          const feedback = s.comment ?? '';
          await prisma.judgeReview.upsert({
            where: { judgeAssignmentId: assignment.id },
            create: {
              judgeAssignmentId: assignment.id,
              overallFeedback: feedback,
              submittedAt: new Date(),
              revisionCount: 1,
            },
            update: {},
          });
          await prisma.scoreRevision.create({
            data: {
              judgeAssignmentId: assignment.id,
              revisionNumber: 1,
              scoresSnapshotJson: s.criteria,
              overallFeedbackSnapshot: feedback,
            },
          });

          return assignment.id;
        },
      );

      if (s.judge === sampleAssignmentJudgeFixtureId && !sampleAssignmentId) {
        sampleAssignmentId = assignmentId;
      }
    }
  }

  return {
    eventId: event.id,
    eventSlug: event.slug,
    organizerUserId,
    judgeUserIds: fixtures.judges.map((j) => judgeInternalIdByFixtureId.get(j.id)!).filter(Boolean),
    firstParticipantUserId,
    firstTeamSubmissionId,
    sampleAssignmentId,
  };
}

export async function issueSession(prisma: PrismaClient, userId: string): Promise<string> {
  const rawToken = generateRawToken();
  const tokenHash = sha256Hex(rawToken);
  // Comfortably outlives the 72-hour build window (D166).
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });
  return rawToken;
}
