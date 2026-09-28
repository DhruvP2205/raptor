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
// Kept in sync with apps/api/src/events/utils/event-phase.ts's
// authoritative list — JUDGING_CLOSED (Module 8, docs/stages/
// 08-rubric-and-scoring.md Section 7) was missing here entirely until
// Module 15 needed to key its "next recommended action" banner off it
// (design/15-organizer-shell.md Section 3), a real type-drift bug this
// pass caught: PhaseBadge's PHASE_TONE map had no entry for it either.
export type EventPhase =
  | 'NOT_STARTED'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'SUBMISSIONS_OPEN'
  | 'SUBMISSIONS_CLOSED'
  | 'JUDGING'
  | 'JUDGING_CLOSED'
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
  // Module 11 — organizer-chosen once, at event creation/before round 1
  // exists; null until then (setEligibilityMode's own lock condition).
  votingEligibilityMode: VotingEligibilityMode | null;
  // Module 12 — the one-way switch; false until an organizer enables it
  // (only possible once a PublishedResultVersion is LIVE).
  certificatesEnabled: boolean;
  certificatesEnabledAt: string | null;
  // Module 13 — organizer-toggleable, default true. Gates new comment
  // creation only; existing comments stay visible when false.
  commentsEnabled: boolean;
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
  // Only present on GET /submissions/:id (Module 13) — whether new
  // comments can currently be posted on this submission's event.
  event?: { commentsEnabled: boolean } | null;
  // Only present on GET /submissions/:id, for a non-owner viewer —
  // distinguishes "stranger" from "organizer/admin with no
  // verification row yet" (both would otherwise show
  // verification: null). Drives the comment-moderation "Remove"
  // affordance (Module 13).
  isOrganizerOrAdmin?: boolean;
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

// Module 11 (Voting) — see stages/11-voting.md.
export type VotingEligibilityMode = 'PARTICIPANTS_ONLY' | 'VERIFIED_PLATFORM_USERS';
export type VotingRoundStatus = 'ACTIVE' | 'SUPERSEDED' | 'DEACTIVATED';
export type VoteAbuseFlagStatus = 'PENDING' | 'REVIEWED_CLEARED' | 'REVIEWED_BANNED';
export type VotingResultVersionStatus = 'LIVE' | 'SUPERSEDED' | 'UNPUBLISHED';
export type VotingCorrectionType = 'DISQUALIFY' | 'REASSIGN_CREDIT';

export interface VotingRound {
  id: string;
  eventId: string;
  roundNumber: number;
  status: VotingRoundStatus;
  votingOpensAt: string;
  votingClosesAt: string;
  votingWinnerAnnounceAt: string;
  deactivatedAt: string | null;
  deactivatedByUserId: string | null;
  deactivationReason: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface ShortlistSuggestion {
  submissionId: string;
  title: string | null;
  finalScore: number;
  rank: number;
}

export interface ShortlistEntryRow {
  id: string;
  votingRoundId: string;
  submissionId: string;
  addedByUserId: string;
  isAutoSuggested: boolean;
  createdAt: string;
  submission?: { id: string; title: string | null };
}

export interface PublicShortlist {
  roundId: string;
  roundNumber: number;
  votingOpensAt: string;
  votingClosesAt: string;
  entries: ShortlistEntryRow[];
}

export interface VotingTallyEntry {
  submissionId: string;
  voteCount: number;
  votePercentage: number;
  isSharedWin: boolean;
}

export interface VoteAbuseFlag {
  id: string;
  votingRoundId: string;
  ipHash: string;
  implicatedUserIds: string[];
  status: VoteAbuseFlagStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface VotingResultEntry {
  id: string;
  votingResultVersionId: string;
  submissionId: string;
  voteCount: number;
  votePercentage: number;
  isSharedWin: boolean;
  isDisqualified: boolean;
  submission: { id: string; title: string | null } | null;
}

export interface VotingResultVersionSummary {
  id: string;
  eventId: string;
  votingRoundId: string;
  versionNumber: number;
  status: VotingResultVersionStatus;
  publishedByUserId: string;
  publishedAt: string;
  correctionReason: string | null;
  unpublishReason: string | null;
}

export interface VotingResultVersion extends VotingResultVersionSummary {
  entries: VotingResultEntry[];
  // Derived, not persisted — see voting-results.service.ts's
  // deriveCorrectedSubmissionId. Null on a non-correction version.
  correctedSubmissionId: string | null;
}

export interface PowChallenge {
  challengeId: string;
  challenge: string;
  difficultyBits: number;
}

export interface VotingCaptchaChallenge {
  challengeId: string;
  svg: string;
}

export type VotingIneligibleReason = 'NOT_SIGNED_IN' | 'ACCOUNT_TOO_NEW' | 'NOT_PARTICIPANT' | 'EMAIL_NOT_VERIFIED';

export interface VotingEligibility {
  eligible: boolean;
  reason: VotingIneligibleReason | null;
}

// Module 12 (Certificates) — see stages/12-certificates.md.
export type CertificateRole = 'PARTICIPANT' | 'JUDGE' | 'WINNER' | 'SPECIAL_AWARD_WINNER';

export interface CertificateTemplate {
  id: string;
  eventId: string;
  svgMarkup: string;
  version: number;
  createdAt: string;
}

// The raw Certificate row — returned by the self-service (generate/list
// mine) and manual-issue routes. No svg/verified/canDownload on this
// shape; those are computed only by the public view/gallery endpoints.
export interface Certificate {
  id: string;
  eventId: string;
  userId: string;
  role: CertificateRole;
  teamId: string | null;
  submissionId: string | null;
  payloadJson: CertificatePlaceholders;
  signature: string;
  publicKeyId: string;
  templateId: string;
  templateVersion: number;
  issuedAt: string;
}

// Exactly the {{token}} substitution set svg-placeholder.util.ts
// supports — also exactly the shape of Certificate.payloadJson.
export interface CertificatePlaceholders {
  recipientName: string;
  eventName: string;
  role: string;
  projectName: string | null;
  teamName: string | null;
  issuedDate: string;
  certificateId: string;
  verifyUrl: string;
}

// GET /certificates/:id — public view response.
export interface PublicCertificate extends CertificatePlaceholders {
  certificateId: string;
  svg: string;
  verified: boolean;
  // Derived server-side from the viewer's own session (if any) via the
  // same check the real download route enforces — lets the frontend
  // show the Download button as disabled-with-explanation instead of
  // guessing and getting a 403 (design/12-certificates.md Section 2).
  canDownload: boolean;
}

// GET /users/:userId/certificates — public gallery entry.
export interface GalleryCertificate extends CertificatePlaceholders {
  certificateId: string;
  role: CertificateRole;
  issuedAt: string;
  event: { id: string; name: string; slug: string };
}

// Module 13 (Comments) — see stages/13-comments.md.
// Raw Comment row — returned by create/update/remove.
export interface Comment {
  id: string;
  submissionId: string;
  userId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletionReason: string | null;
}

// GET /submissions/:submissionId/comments — joined with author identity.
export interface CommentWithAuthor extends Comment {
  user: { id: string; displayName: string };
}

// Module 14 (Global Ranking) — see stages/14-global-ranking.md.
export type GlobalAwardKind = 'PODIUM_FIRST' | 'PODIUM_SECOND' | 'PODIUM_THIRD' | 'SPECIAL_AWARD' | 'AUDIENCE_CHOICE';

export interface GlobalPointsConfigRow {
  awardKind: GlobalAwardKind;
  points: number;
  updatedByUserId: string | null;
  updatedAt: string | null;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  rank: number;
  isTied: boolean;
  points: number;
  prizeUsdTotal: number;
  eventsCount: number;
  awardsCount: number;
  firstsCount: number;
  secondsCount: number;
  thirdsCount: number;
}

export interface LeaderboardPage {
  snapshotId: string | null;
  generatedAt: string | null;
  page: number;
  limit: number;
  totalCount: number;
  entries: LeaderboardEntry[];
}

export interface GlobalRankingAward {
  event: { id: string; name: string; slug: string };
  submissionId: string | null;
  awardKind: GlobalAwardKind;
  label: string;
  teamName: string | null;
  projectName: string | null;
  finalScore: number | null;
  prizeUsd: number | null;
  pointsAwarded: number;
}

// GET /global-ranking/:userId — a real account always returns this
// shape (never null); rank stays null and awards stays [] for a real
// user with no ranking data yet (design doc Section 3's own explicit
// "normal state for most users" case). A truly nonexistent userId 404s
// instead (ApiError with code USER_NOT_FOUND).
export interface GlobalRankingDrilldown {
  userId: string;
  displayName: string;
  rank: number | null;
  isTied: boolean;
  points: number;
  prizeUsdTotal: number;
  eventsCount: number;
  awardsCount: number;
  firstsCount: number;
  secondsCount: number;
  thirdsCount: number;
  awards: GlobalRankingAward[];
}

// Every section below is independently nullable — `null` means that
// one section's own backend fetch failed, distinct from a genuine
// zero/empty state, so each Overview card can show its own "Couldn't
// load" + retry without the other eleven cards being affected
// (design/15-organizer-shell.md Section 6's explicit requirement).
export interface OrganizerSummary {
  isAdminBypass: boolean;
  tracksPrizes: { tracksCount: number; prizesCount: number } | null;
  judges: { accepted: number; pending: number; declined: number } | null;
  rubric: { scoringCount: number; bonusCount: number; configured: boolean } | null;
  submissions: { finalizedCount: number } | null;
  verification: { approved: number; pendingReview: number; disqualified: number } | null;
  assignment: {
    totalSubmissions: number;
    assignedCount: number;
    unassignedCount: number;
    avgReviewsPerSubmission: number;
  } | null;
  progress: { percentComplete: number; judgesNotStarted: number; totalJudges: number } | null;
  normalization: { lastRunAt: string | null; judgingStillOpen: boolean } | null;
  results: { state: 'NOT_STARTED' | 'DRAFT' | 'PUBLISHED' } | null;
  voting: { state: 'NOT_STARTED' | 'OPEN' | 'CLOSED'; roundNumber: number | null; votingClosesAt: string | null } | null;
  certificates: { enabled: boolean; issuedCount: number } | null;
}

export interface ApiErrorBody {
  code?: string;
  message: string | string[];
  fields?: string[];
  error?: string;
  statusCode?: number;
}
