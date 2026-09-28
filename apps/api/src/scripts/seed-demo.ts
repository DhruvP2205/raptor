import 'dotenv/config';

import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { CertificateSigningService } from '../certificates/certificate-signing.service';
import { generateRawToken } from '../common/crypto.util';
import { normalizeEmail } from '../common/email.util';
import { computeJudgeZScore, rescaleToZeroHundred } from '../normalization/normalization-formula';
import { computeFinalScore, computeJudgeRawTotal } from '../scoring/score-formula';
import { computeRankResults } from '../results/results-formula';
import { GLOBAL_RANKING_QUEUE_NAME } from '../queues/global-ranking-queue.service';
import { createBullmqConnection } from '../queues/bullmq-connection';
import { Queue } from 'bullmq';

// Module 20 (docs/design/20-demo-environment.md) — human-facing demo
// content, only ever run when DEMO_MODE=true (checked by the caller,
// docker-entrypoint.sh). Explicitly separate from Module 16's fixtures
// importer (Section 1): this never runs against the real `raptor`
// database — DEMO_MODE selects `raptor_demo` at the connection-string
// level (docker-entrypoint.sh), not at the row level here.
//
// Idempotent per Section 3: each of the four events has a fixed,
// predictable slug. Timeline fields are recomputed against `now` on
// every run (kept "perpetually fresh"); team/submission/score/comment/
// certificate content is generated once and left untouched afterward
// (checked via a per-event team count, not a separate marker table —
// simpler, and content generation is the only thing gated on it).
//
// Run directly with `node`:
//   node dist/scripts/seed-demo.js

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const ORGANIZER_EMAIL = 'demo.organizer@raptor.demo';
const JUDGE_EMAILS = ['demo.judge.a@raptor.demo', 'demo.judge.b@raptor.demo', 'demo.judge.c@raptor.demo'];

async function randomPasswordHash(): Promise<string> {
  return argon2.hash(generateRawToken());
}

async function upsertUser(
  prisma: PrismaClient,
  email: string,
  displayName: string,
  accountType: 'ORGANIZER' | 'JUDGE' | 'PARTICIPANT',
) {
  const normalized = normalizeEmail(email);
  return prisma.user.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      passwordHash: await randomPasswordHash(),
      displayName,
      accountType,
      emailVerifiedAt: new Date(),
    },
    update: {},
  });
}

interface StaffPool {
  organizerId: string;
  judgeIds: string[];
}

async function ensureStaffPool(prisma: PrismaClient): Promise<StaffPool> {
  const organizer = await upsertUser(prisma, ORGANIZER_EMAIL, 'Demo Organizer', 'ORGANIZER');
  const judges = [];
  const judgeNames = ['Judge Alice', 'Judge Bilal', 'Judge Chen'];
  for (let i = 0; i < JUDGE_EMAILS.length; i++) {
    judges.push(await upsertUser(prisma, JUDGE_EMAILS[i], judgeNames[i], 'JUDGE'));
  }
  return { organizerId: organizer.id, judgeIds: judges.map((j) => j.id) };
}

async function grantEventMembership(
  prisma: PrismaClient,
  userId: string,
  eventId: string,
  role: 'ORGANIZER' | 'JUDGE' | 'PARTICIPANT',
) {
  await prisma.eventMembership.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId, role, invitationStatus: 'ACCEPTED' },
    update: { invitationStatus: 'ACCEPTED' },
  });
}

interface TeamSpec {
  name: string;
  memberNamesEmails: { name: string; email: string }[];
}

async function ensureTeamWithSubmission(
  prisma: PrismaClient,
  eventId: string,
  spec: TeamSpec,
  submission: { title: string; description: string; repoUrl: string; everSubmitted: boolean; submittedAt: Date | null } | null,
): Promise<{ teamId: string; memberIds: string[]; submissionId: string | null }> {
  const memberIds: string[] = [];
  for (const m of spec.memberNamesEmails) {
    const user = await upsertUser(prisma, m.email, m.name, 'PARTICIPANT');
    await grantEventMembership(prisma, user.id, eventId, 'PARTICIPANT');
    memberIds.push(user.id);
  }

  const team = await prisma.team.upsert({
    where: { eventId_name: { eventId, name: spec.name } },
    create: {
      eventId,
      name: spec.name,
      adminUserId: memberIds[0],
      joinLinkPrefix: spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      joinLinkSuffix: generateRawToken(3),
    },
    update: {},
  });
  for (const userId of memberIds) {
    await prisma.teamMembership.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      create: { teamId: team.id, userId },
      update: {},
    });
  }

  let submissionId: string | null = null;
  if (submission) {
    const existing = await prisma.submission.findUnique({ where: { teamId: team.id } });
    const row =
      existing ??
      (await prisma.submission.create({
        data: {
          eventId,
          submissionType: 'TEAM',
          teamId: team.id,
          title: submission.title,
          description: submission.description,
          repoUrl: submission.repoUrl,
          isDraft: !submission.everSubmitted,
          everSubmitted: submission.everSubmitted,
          submittedAt: submission.submittedAt,
        },
      }));
    submissionId = row.id;
  }

  return { teamId: team.id, memberIds, submissionId };
}

async function ensureScoringCriterion(prisma: PrismaClient, eventId: string) {
  const existing = await prisma.rubricCriterion.findFirst({ where: { eventId, kind: 'SCORING' } });
  if (existing) return existing;
  return prisma.rubricCriterion.create({
    data: { eventId, kind: 'SCORING', label: 'Overall Quality', description: 'Overall project quality.', weightPercent: 100 },
  });
}

// Writes a COMPLETED JudgeAssignment + Score + JudgeReview (+
// SubmissionVerification if missing) for one (judge, submission) pair,
// scored on the single SCORING criterion at `value` (0-100). Returns
// the raw total for this judge (== value, single-criterion event).
async function ensureJudgedAssignment(
  prisma: PrismaClient,
  eventId: string,
  judgeId: string,
  submissionId: string,
  criterionId: string,
  value: number,
): Promise<number> {
  await prisma.submissionVerification.upsert({
    where: { submissionId },
    create: { submissionId, checkStatus: 'VERIFIED', finalDecision: 'APPROVED', checkedAt: new Date() },
    update: {},
  });

  let assignment = await prisma.judgeAssignment.findFirst({ where: { eventId, judgeId, submissionId } });
  if (!assignment) {
    assignment = await prisma.judgeAssignment.create({
      data: { eventId, judgeId, submissionId, assignmentMethod: 'MANUAL', status: 'COMPLETED', completedAt: new Date() },
    });
  }

  await prisma.score.upsert({
    where: { judgeAssignmentId_criterionId: { judgeAssignmentId: assignment.id, criterionId } },
    create: { judgeAssignmentId: assignment.id, criterionId, value },
    update: { value },
  });
  await prisma.judgeReview.upsert({
    where: { judgeAssignmentId: assignment.id },
    create: { judgeAssignmentId: assignment.id, overallFeedback: 'Solid work overall.', submittedAt: new Date(), revisionCount: 1 },
    update: {},
  });
  await prisma.scoreRevision.upsert({
    where: { judgeAssignmentId_revisionNumber: { judgeAssignmentId: assignment.id, revisionNumber: 1 } },
    create: {
      judgeAssignmentId: assignment.id,
      revisionNumber: 1,
      scoresSnapshotJson: { [criterionId]: value },
      overallFeedbackSnapshot: 'Solid work overall.',
    },
    update: {},
  });

  const { rawTotal } = computeJudgeRawTotal([{ kind: 'SCORING', weightPercent: 100, value }]);
  return rawTotal;
}

async function seedDraftEvent(prisma: PrismaClient, staff: StaffPool, now: number) {
  const slug = 'demo-draft';
  const event = await prisma.event.upsert({
    where: { slug },
    create: {
      name: 'Demo: Next Spring Hackathon (Draft)',
      slug,
      status: 'DRAFT',
      registrationOpensAt: new Date(now + 10 * DAY),
      registrationClosesAt: new Date(now + 20 * DAY),
      eventStartsAt: new Date(now + 21 * DAY),
      submissionsOpenAt: new Date(now + 21 * DAY),
      submissionsCloseAt: new Date(now + 23 * DAY),
      eventEndsAt: new Date(now + 23 * DAY),
      judgingClosesAt: new Date(now + 24 * DAY),
      resultsAnnounceAt: new Date(now + 25 * DAY),
      votingOpensAt: new Date(now + 25 * DAY + HOUR),
      votingClosesAt: new Date(now + 26 * DAY),
      votingWinnerAnnounceAt: new Date(now + 26 * DAY + HOUR),
      eventClosedAt: new Date(now + 27 * DAY),
    },
    update: {
      registrationOpensAt: new Date(now + 10 * DAY),
      registrationClosesAt: new Date(now + 20 * DAY),
      eventStartsAt: new Date(now + 21 * DAY),
      submissionsOpenAt: new Date(now + 21 * DAY),
      submissionsCloseAt: new Date(now + 23 * DAY),
      eventEndsAt: new Date(now + 23 * DAY),
      judgingClosesAt: new Date(now + 24 * DAY),
      resultsAnnounceAt: new Date(now + 25 * DAY),
      votingOpensAt: new Date(now + 25 * DAY + HOUR),
      votingClosesAt: new Date(now + 26 * DAY),
      votingWinnerAnnounceAt: new Date(now + 26 * DAY + HOUR),
      eventClosedAt: new Date(now + 27 * DAY),
    },
  });
  await grantEventMembership(prisma, staff.organizerId, event.id, 'ORGANIZER');
  // Section 2.2 — zero teams, zero submissions, deliberately. Nothing
  // further to generate; a draft's correct realistic state is empty.
  return event;
}

async function seedRunningEvent(prisma: PrismaClient, staff: StaffPool, now: number) {
  const slug = 'demo-running';
  // computeEventPhase (event-phase.ts) walks PHASE_BOUNDARIES in fixed
  // order and stops at the first boundary still in the future — it
  // assumes a strictly ascending timeline, the same invariant
  // EventsService's own creation validation enforces for a real
  // organizer. registrationClosesAt must land at-or-before
  // eventStartsAt, not after it (an earlier version of this had
  // registrationClosesAt in the future while eventStartsAt was
  // already 2 days in the past — an inverted, invalid ordering that
  // made the phase compute as REGISTRATION_OPEN, not
  // SUBMISSIONS_OPEN). "Registration still open for others" (Section
  // 2's narrative) describes the *data* (some registered, not yet on
  // a team), not a distinct EventPhase value — the phase model has no
  // combined state for that, by design.
  const timeline = {
    registrationOpensAt: new Date(now - 5 * DAY),
    registrationClosesAt: new Date(now - 3 * DAY),
    eventStartsAt: new Date(now - 2 * DAY),
    submissionsOpenAt: new Date(now - 2 * DAY),
    submissionsCloseAt: new Date(now + 2 * DAY),
    eventEndsAt: new Date(now + 3 * DAY),
    judgingClosesAt: new Date(now + 4 * DAY),
    resultsAnnounceAt: new Date(now + 5 * DAY),
    votingOpensAt: new Date(now + 5 * DAY),
    votingClosesAt: new Date(now + 6 * DAY),
    votingWinnerAnnounceAt: new Date(now + 6 * DAY + 12 * HOUR),
    eventClosedAt: new Date(now + 7 * DAY),
  };
  const event = await prisma.event.upsert({
    where: { slug },
    create: { name: 'Demo: Spring Hackathon (Running)', slug, status: 'PUBLISHED', ...timeline },
    update: timeline,
  });
  await grantEventMembership(prisma, staff.organizerId, event.id, 'ORGANIZER');

  const existingTeamCount = await prisma.team.count({ where: { eventId: event.id } });
  if (existingTeamCount > 0) return event;

  const submittedTeams: TeamSpec[] = [
    { name: 'Pixel Foragers', memberNamesEmails: [{ name: 'Runner One', email: 'demo.running.p1@raptor.demo' }, { name: 'Runner Two', email: 'demo.running.p2@raptor.demo' }] },
    { name: 'Quiet Static', memberNamesEmails: [{ name: 'Runner Three', email: 'demo.running.p3@raptor.demo' }] },
    { name: 'Northbound Kit', memberNamesEmails: [{ name: 'Runner Four', email: 'demo.running.p4@raptor.demo' }, { name: 'Runner Five', email: 'demo.running.p5@raptor.demo' }] },
    { name: 'Amber Loop', memberNamesEmails: [{ name: 'Runner Six', email: 'demo.running.p6@raptor.demo' }] },
  ];
  const registeredNotSubmittedTeams: TeamSpec[] = [
    { name: 'Late Harvest', memberNamesEmails: [{ name: 'Runner Seven', email: 'demo.running.p7@raptor.demo' }] },
    { name: 'Slow Ember', memberNamesEmails: [{ name: 'Runner Eight', email: 'demo.running.p8@raptor.demo' }] },
  ];

  for (const spec of submittedTeams) {
    await ensureTeamWithSubmission(prisma, event.id, spec, {
      title: `${spec.name}'s project`,
      description: 'A work in progress, still being iterated on.',
      repoUrl: 'https://github.com/example/demo-running-project',
      everSubmitted: true,
      submittedAt: new Date(now - HOUR),
    });
  }
  for (const spec of registeredNotSubmittedTeams) {
    await ensureTeamWithSubmission(prisma, event.id, spec, null);
  }

  return event;
}

async function seedVotingEvent(prisma: PrismaClient, staff: StaffPool, now: number) {
  const slug = 'demo-voting';
  // Exact offsets per docs/design/20-demo-environment.md Section 2.1
  // (every field listed explicitly, in order, after the Running-event
  // ordering bug — D180 — showed what an incomplete date spec invites).
  const timeline = {
    registrationOpensAt: new Date(now - 9 * DAY),
    registrationClosesAt: new Date(now - 7 * DAY),
    eventStartsAt: new Date(now - 7 * DAY),
    submissionsOpenAt: new Date(now - 7 * DAY),
    submissionsCloseAt: new Date(now - 3 * DAY),
    eventEndsAt: new Date(now - 3 * DAY),
    judgingClosesAt: new Date(now - 1 * DAY),
    resultsAnnounceAt: new Date(now - 12 * HOUR),
    votingOpensAt: new Date(now - 6 * HOUR),
    votingClosesAt: new Date(now + 18 * HOUR),
    votingWinnerAnnounceAt: new Date(now + 19 * HOUR),
    eventClosedAt: new Date(now + 20 * HOUR),
  };
  const event = await prisma.event.upsert({
    where: { slug },
    create: {
      name: 'Demo: Winter Hackathon (Voting Open)',
      slug,
      status: 'PUBLISHED',
      votingEligibilityMode: 'PARTICIPANTS_ONLY',
      ...timeline,
    },
    update: timeline,
  });
  await grantEventMembership(prisma, staff.organizerId, event.id, 'ORGANIZER');
  for (const judgeId of staff.judgeIds.slice(0, 2)) {
    await grantEventMembership(prisma, judgeId, event.id, 'JUDGE');
  }

  const existingTeamCount = await prisma.team.count({ where: { eventId: event.id } });
  if (existingTeamCount > 0) return event;

  const criterion = await ensureScoringCriterion(prisma, event.id);
  const teamSpecs: TeamSpec[] = [
    { name: 'Firelight Studio', memberNamesEmails: [{ name: 'Voter One', email: 'demo.voting.p1@raptor.demo' }] },
    { name: 'Coral Drift', memberNamesEmails: [{ name: 'Voter Two', email: 'demo.voting.p2@raptor.demo' }] },
    { name: 'Wren & Anchor', memberNamesEmails: [{ name: 'Voter Three', email: 'demo.voting.p3@raptor.demo' }] },
    { name: 'Hollow Peak', memberNamesEmails: [{ name: 'Voter Four', email: 'demo.voting.p4@raptor.demo' }] },
    { name: 'Bright Ledger', memberNamesEmails: [{ name: 'Voter Five', email: 'demo.voting.p5@raptor.demo' }] },
  ];
  const rawScores = [88, 74, 91, 65, 80];
  const submissionIds: string[] = [];
  const memberIdsBySubmission = new Map<string, string[]>();

  for (let i = 0; i < teamSpecs.length; i++) {
    const { submissionId, memberIds } = await ensureTeamWithSubmission(prisma, event.id, teamSpecs[i], {
      title: `${teamSpecs[i].name}'s project`,
      description: 'A completed, judged submission.',
      repoUrl: 'https://github.com/example/demo-voting-project',
      everSubmitted: true,
      submittedAt: new Date(now - 5 * DAY),
    });
    submissionIds.push(submissionId!);
    memberIdsBySubmission.set(submissionId!, memberIds);

    for (const judgeId of staff.judgeIds.slice(0, 2)) {
      await ensureJudgedAssignment(prisma, event.id, judgeId, submissionId!, criterion.id, rawScores[i]);
    }
  }

  // Published results (Section 2.2 — "fully judged, results published").
  const candidates = submissionIds.map((submissionId, i) => {
    const { averageRawTotal, finalScore } = computeFinalScore([rawScores[i], rawScores[i]], event.finalScoreDisplayScale);
    return { submissionId, finalScore, averageRawTotal, bonusRaw: 0 };
  });
  const ranked = computeRankResults(candidates);
  const existingVersion = await prisma.publishedResultVersion.findFirst({ where: { eventId: event.id, status: 'LIVE' } });
  if (!existingVersion) {
    const version = await prisma.publishedResultVersion.create({
      data: { eventId: event.id, versionNumber: 1, status: 'LIVE', publishedByUserId: staff.organizerId },
    });
    for (const r of ranked) {
      const c = candidates.find((x) => x.submissionId === r.submissionId)!;
      await prisma.rankResultEntry.create({
        data: {
          publishedResultVersionId: version.id,
          submissionId: r.submissionId,
          rank: r.rank,
          displayScore: c.finalScore,
          isScoreOverridden: false,
        },
      });
    }
  }

  // Voting round, currently open — shortlist every submission, cast a
  // few votes so the tally isn't zero, but publish NOTHING (Module 11's
  // own rule: no tallies visible while the round is still open,
  // Section 2.2's own note — this demo event doesn't get an exception).
  const existingRound = await prisma.votingRound.findFirst({ where: { eventId: event.id } });
  const round =
    existingRound ??
    (await prisma.votingRound.create({
      data: {
        eventId: event.id,
        roundNumber: 1,
        status: 'ACTIVE',
        votingOpensAt: timeline.votingOpensAt,
        votingClosesAt: timeline.votingClosesAt,
        votingWinnerAnnounceAt: timeline.votingWinnerAnnounceAt,
        createdByUserId: staff.organizerId,
      },
    }));
  if (!existingRound) {
    for (const submissionId of submissionIds) {
      await prisma.shortlistEntry.upsert({
        where: { votingRoundId_submissionId: { votingRoundId: round.id, submissionId } },
        create: { votingRoundId: round.id, submissionId, addedByUserId: staff.organizerId, isAutoSuggested: false },
        update: {},
      });
    }
    // A handful of synthetic votes, spread unevenly (not zero, not a tie).
    const voteCounts = [2, 3, 1, 0, 1];
    let voterCounter = 0;
    for (let i = 0; i < submissionIds.length; i++) {
      for (let v = 0; v < voteCounts[i]; v++) {
        voterCounter++;
        const voter = await upsertUser(prisma, `demo.voter${voterCounter}@raptor.demo`, `Demo Voter ${voterCounter}`, 'PARTICIPANT');
        await grantEventMembership(prisma, voter.id, event.id, 'PARTICIPANT');
        await prisma.vote.upsert({
          where: { votingRoundId_userId: { votingRoundId: round.id, userId: voter.id } },
          create: { votingRoundId: round.id, submissionId: submissionIds[i], userId: voter.id },
          update: {},
        });
      }
    }
  }

  return event;
}

async function seedArchivedEvent(prisma: PrismaClient, staff: StaffPool, signing: CertificateSigningService, now: number) {
  const slug = 'demo-archived';
  // Exact offsets per docs/design/20-demo-environment.md Section 2.1.
  const timeline = {
    registrationOpensAt: new Date(now - 10 * DAY),
    registrationClosesAt: new Date(now - 8 * DAY),
    eventStartsAt: new Date(now - 8 * DAY),
    submissionsOpenAt: new Date(now - 8 * DAY),
    submissionsCloseAt: new Date(now - 4 * DAY),
    eventEndsAt: new Date(now - 4 * DAY),
    judgingClosesAt: new Date(now - 3 * DAY),
    resultsAnnounceAt: new Date(now - 2 * DAY),
    votingOpensAt: new Date(now - 2 * DAY),
    votingClosesAt: new Date(now - 1 * DAY),
    votingWinnerAnnounceAt: new Date(now - 12 * HOUR),
    eventClosedAt: new Date(now - 6 * HOUR),
  };
  const event = await prisma.event.upsert({
    where: { slug },
    create: {
      name: 'Demo: Autumn Hackathon (Archived)',
      slug,
      status: 'ARCHIVED',
      votingEligibilityMode: 'PARTICIPANTS_ONLY',
      certificatesEnabled: true,
      certificatesEnabledAt: new Date(now - 1 * DAY),
      certificatesEnabledByUserId: staff.organizerId,
      commentsEnabled: true,
      ...timeline,
    },
    update: timeline,
  });
  await grantEventMembership(prisma, staff.organizerId, event.id, 'ORGANIZER');
  for (const judgeId of staff.judgeIds) {
    await grantEventMembership(prisma, judgeId, event.id, 'JUDGE');
  }

  const existingTeamCount = await prisma.team.count({ where: { eventId: event.id } });
  if (existingTeamCount > 0) return event;

  const criterion = await ensureScoringCriterion(prisma, event.id);

  // Six teams — deliberately two (index 0 and 1) score identically, so
  // the published ranking has a genuine, not synthetic-looking, tied
  // position (Section 2.2's own requirement).
  const teamSpecs: TeamSpec[] = [
    { name: 'Signal & Slate', memberNamesEmails: [{ name: 'Archive One', email: 'demo.archived.p1@raptor.demo' }, { name: 'Archive Two', email: 'demo.archived.p2@raptor.demo' }] },
    { name: 'Cinder Loop', memberNamesEmails: [{ name: 'Archive Three', email: 'demo.archived.p3@raptor.demo' }] },
    { name: 'Marrow Deck', memberNamesEmails: [{ name: 'Archive Four', email: 'demo.archived.p4@raptor.demo' }, { name: 'Archive Five', email: 'demo.archived.p5@raptor.demo' }] },
    { name: 'Hazel Current', memberNamesEmails: [{ name: 'Archive Six', email: 'demo.archived.p6@raptor.demo' }] },
    { name: 'Driftwood Systems', memberNamesEmails: [{ name: 'Archive Seven', email: 'demo.archived.p7@raptor.demo' }] },
    { name: 'Paperlight', memberNamesEmails: [{ name: 'Archive Eight', email: 'demo.archived.p8@raptor.demo' }, { name: 'Archive Nine', email: 'demo.archived.p9@raptor.demo' }] },
  ];
  // Team 0 and Team 1 (index 0, 1) both get [90, 90, 90] from the three
  // judges — a genuine tie, not a hand-set rank number.
  const perJudgeScores = [
    [90, 90, 90],
    [90, 90, 90],
    [82, 78, 85],
    [60, 65, 58],
    [72, 70, 74],
    [55, 60, 52],
  ];

  const submissionIds: string[] = [];
  const memberIdsBySubmission = new Map<string, string[]>();
  const judgeRawTotalsBySubmission = new Map<string, number[]>();

  for (let i = 0; i < teamSpecs.length; i++) {
    const { submissionId, memberIds } = await ensureTeamWithSubmission(prisma, event.id, teamSpecs[i], {
      title: `${teamSpecs[i].name}'s project`,
      description: 'A completed, fully judged, archived submission.',
      repoUrl: 'https://github.com/example/demo-archived-project',
      everSubmitted: true,
      submittedAt: new Date(now - 6 * DAY),
    });
    submissionIds.push(submissionId!);
    memberIdsBySubmission.set(submissionId!, memberIds);

    const rawTotals: number[] = [];
    for (let j = 0; j < staff.judgeIds.length; j++) {
      const rawTotal = await ensureJudgedAssignment(prisma, event.id, staff.judgeIds[j], submissionId!, criterion.id, perJudgeScores[i][j]);
      rawTotals.push(rawTotal);
    }
    judgeRawTotalsBySubmission.set(submissionId!, rawTotals);
  }

  // --- Normalization run (Section 2.2 — "one normalization run") ---
  const existingRun = await prisma.normalizationRun.findFirst({ where: { eventId: event.id } });
  let normalizedFinalScoreBySubmission = new Map<string, number>();
  if (!existingRun) {
    const minimumN = 3;
    // Per-judge mean/stddev across all their raw totals this event.
    const rawTotalsByJudge = new Map<string, number[]>();
    for (let i = 0; i < staff.judgeIds.length; i++) {
      rawTotalsByJudge.set(staff.judgeIds[i], submissionIds.map((sid) => judgeRawTotalsBySubmission.get(sid)![i]));
    }
    const eventAllRawTotals = submissionIds.flatMap((sid) => judgeRawTotalsBySubmission.get(sid)!);
    const eventMean = eventAllRawTotals.reduce((a, b) => a + b, 0) / eventAllRawTotals.length;
    const eventStdDev = Math.sqrt(eventAllRawTotals.reduce((s, v) => s + (v - eventMean) ** 2, 0) / eventAllRawTotals.length);

    const run = await prisma.normalizationRun.create({
      data: { eventId: event.id, runByUserId: staff.organizerId, method: 'Z_SCORE', minimumN, eventMean, eventStdDev },
    });

    const zScoresBySubmission = new Map<string, number[]>();
    for (let j = 0; j < staff.judgeIds.length; j++) {
      const judgeId = staff.judgeIds[j];
      const judgeRawTotals = rawTotalsByJudge.get(judgeId)!;
      const judgeMean = judgeRawTotals.reduce((a, b) => a + b, 0) / judgeRawTotals.length;
      const judgeStdDev = Math.sqrt(judgeRawTotals.reduce((s, v) => s + (v - judgeMean) ** 2, 0) / judgeRawTotals.length);

      for (let i = 0; i < submissionIds.length; i++) {
        const rawTotal = judgeRawTotalsBySubmission.get(submissionIds[i])![j];
        const { zScore } = computeJudgeZScore({
          rawTotal, judgeMean, judgeStdDev, judgeSampleCount: judgeRawTotals.length,
          eventMean, eventStdDev, minimumN,
        });
        const list = zScoresBySubmission.get(submissionIds[i]) ?? [];
        list.push(zScore);
        zScoresBySubmission.set(submissionIds[i], list);

        const assignment = await prisma.judgeAssignment.findFirst({ where: { eventId: event.id, judgeId, submissionId: submissionIds[i] } });
        await prisma.normalizedJudgeScore.create({
          data: {
            normalizationRunId: run.id,
            judgeAssignmentId: assignment!.id,
            rawTotal,
            zScore,
            usedFallback: false,
            judgeMeanAtRun: judgeMean,
            judgeStdDevAtRun: judgeStdDev,
            sampleCountAtRun: judgeRawTotals.length,
            uniformScoringFlagged: judgeStdDev === 0,
          },
        });
      }
    }

    const averagedZBySubmission = submissionIds.map((sid) => {
      const zs = zScoresBySubmission.get(sid)!;
      return zs.reduce((a, b) => a + b, 0) / zs.length;
    });
    const rescaled = rescaleToZeroHundred(averagedZBySubmission);
    // Dense rank within this run, by averagedZScore — same convention
    // Module 10 uses for the official ranking, just this run's own
    // ordering (NormalizedScore.rank's own doc comment).
    const sortedZ = [...averagedZBySubmission].sort((a, b) => b - a);
    const rankByZ = (z: number) => sortedZ.findIndex((v) => v === z) + 1;
    for (let i = 0; i < submissionIds.length; i++) {
      const rawTotals = judgeRawTotalsBySubmission.get(submissionIds[i])!;
      const { finalScore } = computeFinalScore(rawTotals, event.finalScoreDisplayScale);
      normalizedFinalScoreBySubmission.set(submissionIds[i], finalScore);
      await prisma.normalizedScore.create({
        data: {
          normalizationRunId: run.id,
          submissionId: submissionIds[i],
          averagedZScore: averagedZBySubmission[i],
          rescaledValue: rescaled[i],
          finalScore,
          rank: rankByZ(averagedZBySubmission[i]),
        },
      });
    }
  } else {
    const scores = await prisma.normalizedScore.findMany({ where: { normalizationRunId: existingRun.id } });
    normalizedFinalScoreBySubmission = new Map(scores.map((s) => [s.submissionId, s.finalScore]));
  }

  // --- Published results, with the genuine tie (Section 2.2) ---
  const existingVersion = await prisma.publishedResultVersion.findFirst({ where: { eventId: event.id, status: 'LIVE' } });
  let rankBySubmission = new Map<string, number>();
  if (!existingVersion) {
    const candidates = submissionIds.map((sid) => {
      const rawTotals = judgeRawTotalsBySubmission.get(sid)!;
      const { averageRawTotal } = computeFinalScore(rawTotals, event.finalScoreDisplayScale);
      return { submissionId: sid, finalScore: normalizedFinalScoreBySubmission.get(sid)!, averageRawTotal, bonusRaw: 0 };
    });
    const ranked = computeRankResults(candidates);
    rankBySubmission = new Map(ranked.map((r) => [r.submissionId, r.rank]));

    const version = await prisma.publishedResultVersion.create({
      data: { eventId: event.id, versionNumber: 1, status: 'LIVE', publishedByUserId: staff.organizerId },
    });
    for (const r of ranked) {
      const c = candidates.find((x) => x.submissionId === r.submissionId)!;
      await prisma.rankResultEntry.create({
        data: { publishedResultVersionId: version.id, submissionId: r.submissionId, rank: r.rank, displayScore: c.finalScore, isScoreOverridden: false },
      });
    }
  } else {
    const entries = await prisma.rankResultEntry.findMany({ where: { publishedResultVersionId: existingVersion.id } });
    rankBySubmission = new Map(entries.map((e) => [e.submissionId, e.rank]));
  }

  // --- Certificates: PARTICIPANT for everyone, WINNER for rank 1 ---
  const templateExists = await prisma.certificateTemplate.findFirst({ where: { eventId: event.id } });
  const template =
    templateExists ??
    (await prisma.certificateTemplate.create({
      data: {
        eventId: event.id,
        version: 1,
        svgMarkup:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#101014"/><text x="400" y="260" text-anchor="middle" font-size="36" fill="#fff">{{recipientName}}</text><text x="400" y="320" text-anchor="middle" font-size="20" fill="#ccc">{{role}} — {{eventName}}</text><text x="400" y="360" text-anchor="middle" font-size="14" fill="#888">{{projectName}}</text></svg>',
      },
    }));

  if (!existingTeamCount) {
    for (const submissionId of submissionIds) {
      const rank = rankBySubmission.get(submissionId)!;
      const memberIds = memberIdsBySubmission.get(submissionId)!;
      const team = await prisma.team.findUnique({ where: { id: (await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })).teamId! } });
      const submission = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });

      for (const userId of memberIds) {
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        await issueCertificate(prisma, signing, {
          eventId: event.id, eventName: event.name, userId, userName: user.displayName,
          role: 'PARTICIPANT', teamId: team!.id, teamName: team!.name, submissionId, projectName: submission.title,
        });
        if (rank === 1) {
          await issueCertificate(prisma, signing, {
            eventId: event.id, eventName: event.name, userId, userName: user.displayName,
            role: 'WINNER', teamId: team!.id, teamName: team!.name, submissionId, projectName: submission.title,
          });
        }
      }
    }
  }

  // --- Closed voting round with a declared winner ---
  const existingRound = await prisma.votingRound.findFirst({ where: { eventId: event.id } });
  if (!existingRound) {
    const round = await prisma.votingRound.create({
      data: {
        eventId: event.id, roundNumber: 1, status: 'ACTIVE',
        votingOpensAt: timeline.votingOpensAt, votingClosesAt: timeline.votingClosesAt, votingWinnerAnnounceAt: timeline.votingWinnerAnnounceAt,
        createdByUserId: staff.organizerId,
      },
    });
    for (const submissionId of submissionIds) {
      await prisma.shortlistEntry.create({ data: { votingRoundId: round.id, submissionId, addedByUserId: staff.organizerId, isAutoSuggested: false } });
    }
    const voteCounts = [1, 1, 2, 7, 3, 0];
    let voterCounter = 0;
    const totalVotes = voteCounts.reduce((a, b) => a + b, 0);
    const maxVotes = Math.max(...voteCounts);
    const entryData: { submissionId: string; voteCount: number; votePercentage: number; isSharedWin: boolean }[] = [];
    for (let i = 0; i < submissionIds.length; i++) {
      for (let v = 0; v < voteCounts[i]; v++) {
        voterCounter++;
        const voter = await upsertUser(prisma, `demo.archivedvoter${voterCounter}@raptor.demo`, `Demo Archive Voter ${voterCounter}`, 'PARTICIPANT');
        await grantEventMembership(prisma, voter.id, event.id, 'PARTICIPANT');
        await prisma.vote.create({ data: { votingRoundId: round.id, submissionId: submissionIds[i], userId: voter.id } });
      }
      entryData.push({
        submissionId: submissionIds[i],
        voteCount: voteCounts[i],
        votePercentage: totalVotes > 0 ? (voteCounts[i] / totalVotes) * 100 : 0,
        isSharedWin: maxVotes > 0 && voteCounts[i] === maxVotes,
      });
    }
    const resultVersion = await prisma.votingResultVersion.create({
      data: { eventId: event.id, votingRoundId: round.id, versionNumber: 1, status: 'LIVE', publishedByUserId: staff.organizerId },
    });
    for (const e of entryData) {
      await prisma.votingResultEntry.create({ data: { votingResultVersionId: resultVersion.id, ...e } });
    }
  }

  // --- A couple of comments on the winning submission ---
  const winningSubmissionId = [...rankBySubmission.entries()].find(([, r]) => r === 1)?.[0];
  if (winningSubmissionId) {
    const existingComments = await prisma.comment.count({ where: { submissionId: winningSubmissionId } });
    if (existingComments === 0) {
      const commenter = await upsertUser(prisma, 'demo.commenter1@raptor.demo', 'Demo Commenter', 'PARTICIPANT');
      await grantEventMembership(prisma, commenter.id, event.id, 'PARTICIPANT');
      await prisma.comment.create({ data: { submissionId: winningSubmissionId, userId: commenter.id, body: 'Really impressive execution — congrats on the win!' } });
      await prisma.comment.create({ data: { submissionId: winningSubmissionId, userId: staff.organizerId, body: 'Great to see this one come together over the weekend.' } });
    }
  }

  return event;
}

async function issueCertificate(
  prisma: PrismaClient,
  signing: CertificateSigningService,
  args: { eventId: string; eventName: string; userId: string; userName: string; role: 'PARTICIPANT' | 'WINNER'; teamId: string; teamName: string; submissionId: string; projectName: string | null },
) {
  const existing = await prisma.certificate.findUnique({ where: { eventId_userId_role: { eventId: args.eventId, userId: args.userId, role: args.role } } });
  if (existing) return existing;

  const certificateId = crypto.randomUUID();
  const payload = {
    recipientName: args.userName,
    eventName: args.eventName,
    role: args.role,
    projectName: args.projectName,
    teamName: args.teamName,
    issuedDate: new Date().toISOString().slice(0, 10),
    certificateId,
    verifyUrl: `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/certificates/${certificateId}`,
  };
  const { signature, publicKeyId } = signing.sign(payload);

  return prisma.certificate.create({
    data: {
      id: certificateId,
      eventId: args.eventId,
      userId: args.userId,
      role: args.role,
      teamId: args.teamId,
      submissionId: args.submissionId,
      payloadJson: payload,
      signature,
      publicKeyId,
      templateId: (await prisma.certificateTemplate.findFirstOrThrow({ where: { eventId: args.eventId } })).id,
      templateVersion: 1,
    },
  });
}

export async function seedDemoEnvironment(prisma: PrismaClient): Promise<void> {
  const now = Date.now();
  const staff = await ensureStaffPool(prisma);
  const signing = new CertificateSigningService();

  await seedDraftEvent(prisma, staff, now);
  await seedRunningEvent(prisma, staff, now);
  await seedVotingEvent(prisma, staff, now);
  await seedArchivedEvent(prisma, staff, signing, now);

  // Real gap found live: the demo Archived event has published results,
  // certificates, and a declared voting winner, but nothing had ever
  // triggered Module 14's global-ranking recompute against them, so the
  // public leaderboard showed nothing for demo data even though the
  // underlying per-event outcomes were all real. Rather than
  // hand-computing leaderboard rows here (a second, easy-to-drift
  // implementation of Module 14's own tie-break cascade), enqueue a
  // real recompute job on the same queue the admin "recompute" button
  // uses — the actual `worker` container already running in this stack
  // processes it with the real formula (apps/worker/src/global-ranking/),
  // same as it would for genuine platform activity.
  //
  // NOT using GlobalRankingQueueService directly — real bug found live:
  // that service is written for a long-running Nest app where the
  // connection staying open for the process's whole lifetime is exactly
  // right. Here, in a short CLI script, its `connection.close()` doesn't
  // stop the underlying ioredis client's automatic-reconnect loop when
  // Redis is unreachable — the process hung indefinitely retrying,
  // which would have blocked docker-entrypoint.sh from ever reaching
  // `exec node dist/main.js` and left the whole container permanently
  // unhealthy. Fixed by managing the connection directly here and
  // calling `.disconnect()` (which stops retrying), not `.quit()`
  // (which sends a graceful command that itself can hang against an
  // unreachable server) — same fail-open intent as the original
  // service, just with a shutdown that actually completes either way.
  const rankingRedis = createBullmqConnection();
  const rankingQueue = new Queue(GLOBAL_RANKING_QUEUE_NAME, { connection: rankingRedis });
  try {
    await Promise.race([
      rankingQueue.add(
        'recompute',
        { triggeredByUserId: null, triggerReason: 'Module 20 demo seed' },
        { attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch (err) {
    console.warn(`[seed-demo] Failed to enqueue global-ranking recompute (failing open): ${(err as Error).message}`);
  } finally {
    await rankingQueue.close().catch(() => {});
    rankingRedis.disconnect();
  }
}

async function main(): Promise<number> {
  if (process.env.DEMO_MODE !== 'true') {
    console.log('[seed-demo] DEMO_MODE is not "true" — refusing to run (this must never touch a real database).');
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    await seedDemoEnvironment(prisma);
    console.log('[seed-demo] Demo environment ready: demo-draft, demo-running, demo-voting, demo-archived.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exitCode = code;
});
