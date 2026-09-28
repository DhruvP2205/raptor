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
  resultsAnnounceAt: string;
  votingOpensAt: string;
  votingClosesAt: string;
  votingWinnerAnnounceAt: string;
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
