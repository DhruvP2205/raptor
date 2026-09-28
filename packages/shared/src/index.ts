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
}

export interface PublicEventMembership {
  id: string;
  userId: string;
  eventId: string;
  role: EventRole;
  trackIds: string[];
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

export interface ApiErrorBody {
  code?: string;
  message: string | string[];
  fields?: string[];
  error?: string;
  statusCode?: number;
}
