// Shared types/DTOs between @raptor/api and @raptor/web.
// Populated additively as each stage in docs/stages/ introduces
// request/response shapes both sides need to agree on — see
// docs/ARCHITECTURE.md Section 3 for why this package exists.
//
// These are hand-written to match each service's actual `toPublic*`
// response shape (verified against live API responses while building
// the Module 1-5 backend) — not auto-generated from Prisma, since the
// public shape deliberately omits internal fields (password/token
// hashes) that the Prisma model itself still has.

export const RAPTOR_SHARED_VERSION = '0.1.0';

export type AccountType = 'PARTICIPANT' | 'JUDGE' | 'ORGANIZER';
export type EventRole = 'PARTICIPANT' | 'JUDGE' | 'ORGANIZER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'DELETED';
export type TrackAttachmentMode = 'NONE' | 'SINGLE' | 'MULTIPLE';
export type SubmissionType = 'SOLO' | 'TEAM';
export type PrizeDecidedBy = 'JUDGES' | 'PUBLIC_VOTE';
export type RubricCriterionKind = 'SCORING' | 'BONUS' | 'SPECIAL_AWARD';

// Module 3's computed-not-stored phase — see
// apps/api/src/events/utils/event-phase.ts. null for a non-PUBLISHED
// event.
export type EventPhase =
  | 'NOT_STARTED'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'SUBMISSIONS_OPEN'
  | 'SUBMISSIONS_CLOSED'
  | 'JUDGING'
  | 'RESULTS_ANNOUNCED'
  | 'VOTING_OPEN'
  | 'VOTING_CLOSED'
  | 'VOTING_WINNER_ANNOUNCED';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  accountType: AccountType;
  emailVerifiedAt: string | null;
  mustResetPassword: boolean;
  siteAdmin?: boolean;
  createdAt?: string;
}

export interface PublicEvent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  descriptionHtml: string | null;
  posterUrl: string | null;
  thumbnailUrl: string | null;
  status: EventStatus;
  maxTeamSize: number;
  trackAttachmentMode: TrackAttachmentMode;
  // Module 7's event-wide default judge workload cap (per-judge
  // overridable via EventMembership.projectLimitOverride) and Module 8's
  // organizer-facing display scale — both plain Event columns already
  // returned by toPublicEvent's full-row spread, just undeclared here
  // until the assignment board needed the first one.
  maxProjectsPerJudge: number;
  finalScoreDisplayScale: number;
  registrationOpensAt: string;
  registrationClosesAt: string;
  eventStartsAt: string;
  submissionsOpenAt: string;
  submissionsCloseAt: string;
  eventEndsAt: string;
  // Module 8/11's additive timeline fields (apps/api/src/events/dto/create-event.dto.ts) —
  // were missing from this type entirely until the create-event form's
  // live-verify surfaced that the backend DTO had required them for a
  // while (INVALID_TIMELINE_ORDER-adjacent 400 on every submit).
  judgingClosesAt: string;
  resultsAnnounceAt: string;
  votingOpensAt: string;
  votingClosesAt: string;
  votingWinnerAnnounceAt: string;
  eventClosedAt: string;
  createdAt: string;
  updatedAt: string;
  phase: EventPhase | null;
  // Present on GET /events/:slug (detail) and GET /events (list) —
  // both `include` these relations (D84/D88, docs/DECISIONS.md).
  // create/update/publish/archive still omit them; re-fetch rather
  // than relying on those responses for track/prize data.
  tracks?: Track[];
  prizes?: Prize[];
  // Same include-on-detail-and-list, omit-on-write pattern as tracks/prizes
  // (events.service.ts's toPublicEvent generic already carries this
  // through; just hadn't been declared here until Module 8 needed it).
  rubricCriteria?: RubricCriterion[];
}

// Module 8 — docs/design/08-rubric-and-scoring.md Section 2. One flat
// list per event; weightPercent only for SCORING, maxPoints only for
// BONUS, neither for SPECIAL_AWARD (RubricCriteriaService enforces this
// shape server-side, not just by convention).
export interface RubricCriterion {
  id: string;
  eventId: string;
  kind: RubricCriterionKind;
  label: string;
  description: string;
  weightPercent: number | null;
  maxPoints: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Score {
  id: string;
  judgeAssignmentId: string;
  criterionId: string;
  value: number;
  note: string | null;
}

// GET/PATCH /assignments/:id (scoring) — ScoringService.getForScoring's
// exact response shape, returned again after every saveDraft/submitReview.
export interface ScoringData {
  assignmentId: string;
  status: AssignmentStatus;
  submissionId: string;
  criteria: RubricCriterion[];
  scores: Score[];
  overallFeedback: string | null;
  revisionCount: number;
  submittedAt: string | null;
}

export interface PublicEventMembership {
  id: string;
  userId: string;
  eventId: string;
  role: EventRole;
  trackIds: string[];
  // Module 7's per-judge override of Event.maxProjectsPerJudge (Section
  // 4/7, docs/stages/07-judge-assignment.md) — null means "use the
  // event default." Was already returned by the API (a plain column on
  // the row toPublicMembership strips only invitationTokenHash from);
  // just hadn't been declared here yet.
  projectLimitOverride: number | null;
  invitationStatus: InvitationStatus;
  invitedByUserId: string | null;
  invitedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
}

// GET /events/:eventId/judges — same membership row, plus the joined
// user summary the organizer dashboard needs (name/email per row) —
// see MembershipService.listJudgeInvitations's `include`.
export interface JudgeInvitation extends PublicEventMembership {
  user: { id: string; email: string; displayName: string };
}

// GET /invitations/preview — read-only, backs the judge accept/decline
// screen's "event name, event dates" display (docs/design/02-roles-and-membership.md
// Section 4) before Accept/Decline are shown.
export interface InvitationPreview {
  eventId: string;
  eventName: string;
  eventStartsAt: string;
  eventEndsAt: string;
  status: InvitationStatus;
}

export interface Track {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  descriptionHtml: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Prize {
  id: string;
  eventId: string;
  trackId: string | null;
  name: string;
  rank: number;
  decidedBy: PrizeDecidedBy;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  adminUserId: string;
  joinLinkPrefix: string;
  joinLinkSuffix: string;
  createdAt: string;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  userId: string;
  joinedAt: string;
}

// GET /events/:eventId/teams/mine — not in any stage doc, added because
// the frontend has no other way to re-fetch roster/join-code state
// after the initial create/join response (D85, docs/DECISIONS.md).
export interface TeamWithMembers extends Team {
  members: Array<{ userId: string; displayName: string; joinedAt: string }>;
  // Mirrors Submission.everSubmitted for this team's submission (false
  // if none exists yet) — backs the roster-lock UI in
  // docs/design/04-team-management.md Section 3.
  everSubmitted: boolean;
}

export interface Submission {
  id: string;
  eventId: string;
  submissionType: SubmissionType;
  teamId: string | null;
  soloUserId: string | null;
  title: string | null;
  description: string | null;
  descriptionHtml: string | null;
  repoUrl: string | null;
  demoVideoUrl: string | null;
  liveUrl: string | null;
  trackIds: string[];
  isDraft: boolean;
  submittedAt: string | null;
  everSubmitted: boolean;
  createdAt: string;
  updatedAt: string;
  // Only present on GET /submissions/:id and the gallery list
  // (docs/design/05-submission-management.md) — a human-readable name
  // (team name or solo submitter's display name), since the raw
  // teamId/soloUserId foreign keys aren't useful to render directly.
  submitterName?: string | null;
  // Only present on GET /submissions/:id, and only populated for an
  // organizer/admin viewer — null for the owner and for the public
  // (Section 4's "verification-status panel... organizer/admin only").
  verification?: { finalDecision: 'PENDING_REVIEW' | 'APPROVED' | 'DISQUALIFIED' } | null;
}

export type CheckStatus =
  | 'NOT_RUN'
  | 'VERIFIED'
  | 'SUSPICIOUS'
  | 'REJECTED'
  | 'PRIVATE'
  | 'NON_GITHUB'
  | 'ERROR';

// GET /events/:eventId/verifications (and per-row detail) — Module 6's
// organizer-facing review queue. See VerificationService.toPublic.
export interface VerificationRow {
  submissionId: string;
  eventId: string;
  title: string | null;
  submitterName: string | null;
  repoUrl: string | null;
  submittedAt: string | null;
  checkStatus: CheckStatus;
  finalDecision: 'PENDING_REVIEW' | 'APPROVED' | 'DISQUALIFIED';
  firstCommitAt: string | null;
  lastCommitAt: string | null;
  totalCommits: number;
  commitsInWindow: number;
  outsideWindowCommits: Array<{
    sha: string;
    timestamp: string;
    message: string;
    author: string;
  }>;
  finalDecisionRemarks: string | null;
  reviewedByUserId: string | null;
  checkedAt: string | null;
  reviewedAt: string | null;
}

export type AssignmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'TRANSFERRED';
export type AssignmentMethod = 'MANUAL' | 'ALGORITHMIC';

// GET /events/:eventId/assignments/assignable-submissions — the
// organizer assignment board's left pane (Module 7).
export interface AssignableSubmission {
  submissionId: string;
  title: string | null;
  trackIds: string[];
  assignedJudges: Array<{
    assignmentId: string;
    judgeId: string;
    displayName: string;
    email: string;
    status: AssignmentStatus;
  }>;
}

// GET /events/:eventId/assignments (and /mine) — a single assignment
// row, judge- or submission-facing depending on which route returned it.
export interface JudgeAssignmentRow {
  id: string;
  eventId: string;
  judgeId: string;
  submissionId: string;
  status: AssignmentStatus;
  assignmentMethod: AssignmentMethod;
  transferredFromAssignmentId: string | null;
  assignedAt: string;
  judge?: { id: string; displayName: string; email: string };
  submission?: { id: string; title: string | null };
}

// GET /events/:eventId/assignments/mine specifically — richer
// submission projection (track ids + disqualified-after-assignment
// detection) than the generic JudgeAssignmentRow other list routes return.
export interface MyAssignmentRow extends Omit<JudgeAssignmentRow, 'submission'> {
  submission: { id: string; title: string | null; trackIds: string[]; disqualified: boolean } | null;
}

// GET /events/:eventId/assignments/progress — per-judge workload,
// always live-computed (Module 7/8's shared progress dashboard).
export interface JudgeProgress {
  judgeId: string;
  displayName: string;
  email: string;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

// siteAdmin's "drafts in progress" list — deliberately not `Submission`;
// it's a narrower projection the backend query never pulls
// title/description/links for at all (Section 6,
// docs/stages/05-submission-management.md).
export interface DraftInProgressSummary {
  id: string;
  submissionType: SubmissionType;
  teamId: string | null;
  soloUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Module 9 (Normalization) — GET /events/:eventId/normalization-runs.
export interface NormalizationRunSummary {
  id: string;
  eventId: string;
  runByUserId: string;
  runAt: string;
  method: 'Z_SCORE';
  minimumN: number;
  eventMean: number;
  eventStdDev: number;
}

export interface NormalizedJudgeScoreRow {
  id: string;
  normalizationRunId: string;
  judgeAssignmentId: string;
  rawTotal: number;
  judgeMeanAtRun: number;
  judgeStdDevAtRun: number;
  sampleCountAtRun: number;
  usedFallback: boolean;
  uniformScoringFlagged: boolean;
  zScore: number;
  // Joined in NormalizationService.getDetail — wasn't there before,
  // the calibration panel needs a name per row, not just an assignment id.
  judgeAssignment: { judgeId: string; submissionId: string; judge: { displayName: string } };
}

export interface NormalizedScoreRow {
  id: string;
  normalizationRunId: string;
  submissionId: string;
  averagedZScore: number;
  rescaledValue: number;
  finalScore: number;
  rank: number;
  submission: { title: string | null };
  // Derived, read-only, in NormalizationService.getDetail — the actual
  // "Normalization Proof" data (design/09-normalization.md Section 1):
  // per-submission raw average and the ranking that average alone would
  // produce, to diff against the normalized rank above.
  averageRawTotal: number | null;
  rawRank: number | null;
}

export interface NormalizationRunDetail extends NormalizationRunSummary {
  judgeScores: NormalizedJudgeScoreRow[];
  normalizedScores: NormalizedScoreRow[];
}

// GET /admin/judges/:userId/calibration — platform-wide, live-updating
// (Section 8, docs/stages/09-normalization.md).
export interface JudgeCalibrationProfile {
  id: string;
  displayName: string;
  email: string;
  accountType: AccountType;
  judgeCalibrationMean: number;
  judgeCalibrationStdDev: number;
  judgeCalibrationSampleCount: number;
}

// Module 10 (Results & Rankings) — see stages/10-results-and-rankings.md.
export type DraftStatus = 'IN_PROGRESS' | 'READY';
export type PublishMode = 'AUTO' | 'MANUAL';
export type PublishedResultVersionStatus = 'LIVE' | 'SUPERSEDED' | 'UNPUBLISHED';
export type ResultCorrectionType = 'DISQUALIFY' | 'REORDER' | 'SCORE_OVERRIDE';

export interface ResultsDraft {
  id: string;
  eventId: string;
  normalizationRunId: string;
  draftStatus: DraftStatus;
  publishMode: PublishMode;
  createdByUserId: string;
  createdAt: string;
}

// `id`/`publishedResultVersionId` are absent on a not-yet-persisted
// draft preview row, present once it's a real PublishedResultVersion
// entry — one shape covers both so the frontend can render preview and
// published tables with the same component.
export interface RankResultRow {
  id?: string;
  publishedResultVersionId?: string;
  submissionId: string;
  rank: number;
  displayScore: number;
  isScoreOverridden: boolean;
  isDisqualified: boolean;
  submission: { id: string; title: string | null } | null;
}

export interface SpecialAwardResultRow {
  id?: string;
  publishedResultVersionId?: string;
  criterionId: string;
  submissionId: string;
  nominationCount: number;
  isShared: boolean;
  submission: { id: string; title: string | null } | null;
  criterion: { id: string; label: string } | null;
}

export interface ResultsPreview {
  rankEntries: RankResultRow[];
  specialAwardEntries: SpecialAwardResultRow[];
}

export interface PublishedResultVersion extends ResultsPreview {
  id: string;
  eventId: string;
  versionNumber: number;
  status: PublishedResultVersionStatus;
  resultsDraftId: string | null;
  publishedByUserId: string;
  publishedAt: string;
  correctionReason: string | null;
  unpublishReason: string | null;
  // Derived, not persisted — see results.service.ts's
  // deriveCorrectedSubmissionId. Null on an original (non-correction)
  // version.
  correctedSubmissionId: string | null;
}

export interface PublishedResultVersionSummary {
  id: string;
  eventId: string;
  versionNumber: number;
  status: PublishedResultVersionStatus;
  resultsDraftId: string | null;
  publishedByUserId: string;
  publishedAt: string;
  correctionReason: string | null;
  unpublishReason: string | null;
}

export interface ApiErrorBody {
  code?: string;
  message: string | string[];
  fields?: string[];
  error?: string;
  statusCode?: number;
}
