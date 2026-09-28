import type {
  AssignableSubmission,
  DraftInProgressSummary,
  InvitationPreview,
  JudgeAssignmentRow,
  JudgeInvitation,
  JudgeProgress,
  MyAssignmentRow,
  PublicEvent,
  PublicEventMembership,
  PublicUser,
  Submission,
  Team,
  TeamMembership,
  TeamWithMembers,
  Track,
  Prize,
  JudgeCalibrationProfile,
  NormalizationRunDetail,
  NormalizationRunSummary,
  RubricCriterion,
  RubricCriterionKind,
  ScoringData,
  VerificationRow,
  ApiErrorBody,
} from '@raptor/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Event.posterUrl/thumbnailUrl are relative (`/uploads/:id`) — the API
// and web run on different origins, so an <img src> needs the API's
// origin prefixed or the browser requests it from the web app itself.
export function resolveMediaUrl(path: string | null): string | null {
  if (!path) return null;
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  code?: string;
  fields?: string[];
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(Array.isArray(body.message) ? body.message.join(' ') : body.message);
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
  }
}

async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data ?? { message: res.statusText });
  }
  return data as T;
}

// --- Auth ---

export function signup(input: { email: string; password: string; displayName: string }) {
  // No accountType field — signup always produces a PARTICIPANT
  // account server-side (apps/api/src/auth/dto/signup.dto.ts has no
  // such field at all). ORGANIZER/JUDGE accounts only ever come from
  // /admin/staff-accounts.
  return apiFetch<{ user: PublicUser; emailDispatch: string }>('/auth/signup', {
    method: 'POST',
    body: input,
  });
}

export function login(input: { email: string; password: string }) {
  return apiFetch<{ user: PublicUser }>('/auth/login', { method: 'POST', body: input });
}

export function logout() {
  return apiFetch<{ message: string }>('/auth/logout', { method: 'POST' });
}

export function getMe() {
  return apiFetch<PublicUser>('/auth/me');
}

export function verifyEmail(token: string) {
  return apiFetch<{ message: string }>('/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
}

export function resendVerification(email: string) {
  return apiFetch<{ message: string }>('/auth/verify-email/resend', {
    method: 'POST',
    body: { email },
  });
}

export function setPassword(newPassword: string) {
  return apiFetch<{ message: string }>('/auth/set-password', {
    method: 'POST',
    body: { newPassword },
  });
}

// --- Admin ---

export function createStaffAccount(input: {
  email: string;
  displayName: string;
  role: 'ORGANIZER' | 'JUDGE';
  temporaryPassword: string;
}) {
  return apiFetch<{
    id: string;
    email: string;
    displayName: string;
    accountType: 'ORGANIZER' | 'JUDGE';
    mustResetPassword: boolean;
  }>('/admin/staff-accounts', {
    method: 'POST',
    body: { ...input, confirm: true },
  });
}

// --- Events ---

export type EventTimelineInput = {
  name: string;
  slug?: string;
  description?: string;
  maxTeamSize?: number;
  trackAttachmentMode?: 'NONE' | 'SINGLE' | 'MULTIPLE';
  registrationOpensAt: string;
  registrationClosesAt: string;
  eventStartsAt: string;
  submissionsOpenAt: string;
  submissionsCloseAt: string;
  eventEndsAt: string;
  judgingClosesAt: string;
  resultsAnnounceAt: string;
  votingOpensAt: string;
  votingClosesAt: string;
  votingWinnerAnnounceAt: string;
  eventClosedAt: string;
};

export function listEvents(phase?: string) {
  const q = phase ? `?phase=${encodeURIComponent(phase)}` : '';
  return apiFetch<PublicEvent[]>(`/events${q}`);
}

export function listMyEvents() {
  return apiFetch<PublicEvent[]>('/events/mine');
}

export function getEvent(slug: string) {
  return apiFetch<PublicEvent>(`/events/${slug}`);
}

export function createEvent(input: EventTimelineInput) {
  return apiFetch<PublicEvent>('/events', { method: 'POST', body: input });
}

export function updateEvent(eventId: string, input: Partial<EventTimelineInput>) {
  return apiFetch<PublicEvent>(`/events/${eventId}`, { method: 'PATCH', body: input });
}

export function publishEvent(eventId: string) {
  return apiFetch<PublicEvent>(`/events/${eventId}/publish`, { method: 'POST' });
}

export function archiveEvent(eventId: string) {
  return apiFetch<PublicEvent>(`/events/${eventId}/archive`, { method: 'POST' });
}

// Multipart, so it bypasses apiFetch's JSON body handling — the
// browser sets Content-Type (with the correct boundary) itself when
// the body is a FormData and no Content-Type header is set manually.
async function uploadImage(
  path: string,
  file: File,
): Promise<{ posterUrl?: string; thumbnailUrl?: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data ?? { message: res.statusText });
  }
  return data;
}

export function uploadEventPoster(eventId: string, file: File) {
  return uploadImage(`/events/${eventId}/poster`, file);
}

export function uploadEventThumbnail(eventId: string, file: File) {
  return uploadImage(`/events/${eventId}/thumbnail`, file);
}

export function deleteEvent(eventId: string) {
  return apiFetch<void>(`/events/${eventId}`, { method: 'DELETE' });
}

export function registerForEvent(eventId: string) {
  return apiFetch<PublicEventMembership>(`/events/${eventId}/register`, { method: 'POST' });
}

// --- Tracks & Prizes ---

export function createTrack(eventId: string, input: { name: string; description?: string }) {
  return apiFetch<Track>(`/events/${eventId}/tracks`, { method: 'POST', body: input });
}

export function updateTrack(
  eventId: string,
  trackId: string,
  input: { name?: string; description?: string },
) {
  return apiFetch<Track>(`/events/${eventId}/tracks/${trackId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function createPrize(
  eventId: string,
  input: { name: string; rank: number; decidedBy: 'JUDGES' | 'PUBLIC_VOTE'; trackId?: string },
) {
  return apiFetch<Prize>(`/events/${eventId}/prizes`, { method: 'POST', body: input });
}

export function updatePrize(
  eventId: string,
  prizeId: string,
  input: Partial<{
    name: string;
    rank: number;
    decidedBy: 'JUDGES' | 'PUBLIC_VOTE';
    // Explicit null clears the track association; omitted leaves it
    // unchanged — matches UpdatePrizeDto exactly (apps/api/src/prizes/dto).
    trackId: string | null;
  }>,
) {
  return apiFetch<Prize>(`/events/${eventId}/prizes/${prizeId}`, {
    method: 'PATCH',
    body: input,
  });
}

// --- Teams ---

export function getMyTeam(eventId: string) {
  return apiFetch<TeamWithMembers>(`/events/${eventId}/teams/mine`);
}

export function createTeam(eventId: string, name: string) {
  return apiFetch<Team>(`/events/${eventId}/teams`, { method: 'POST', body: { name } });
}

export function joinTeam(code: string) {
  return apiFetch<TeamMembership>('/teams/join', { method: 'POST', body: { code } });
}

export function regenerateTeamLink(teamId: string) {
  return apiFetch<Team>(`/teams/${teamId}/regenerate-link`, { method: 'POST' });
}

export function kickTeamMember(teamId: string, userId: string) {
  return apiFetch<void>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
}

export function leaveTeam(teamId: string) {
  return apiFetch<void>(`/teams/${teamId}/leave`, { method: 'POST' });
}

export function deleteTeam(teamId: string) {
  return apiFetch<void>(`/teams/${teamId}`, { method: 'DELETE', body: { confirm: true } });
}

// --- Roles & membership (judge invitations) ---

export function inviteJudge(eventId: string, email: string) {
  return apiFetch<PublicEventMembership>(`/events/${eventId}/judges`, {
    method: 'POST',
    body: { email },
  });
}

export function listJudgeInvitations(eventId: string) {
  return apiFetch<JudgeInvitation[]>(`/events/${eventId}/judges`);
}

export function resendJudgeInvitation(eventId: string, membershipId: string) {
  return apiFetch<PublicEventMembership>(`/events/${eventId}/judges/${membershipId}/resend`, {
    method: 'POST',
  });
}

// Module 7's "raise this judge's limit" action (design/07-judge-assignment.md
// Section 2 States) — sets EventMembership.projectLimitOverride.
export function updateJudgeMembership(
  eventId: string,
  membershipId: string,
  input: Partial<{ trackIds: string[]; projectLimitOverride: number | null }>,
) {
  return apiFetch<PublicEventMembership>(`/events/${eventId}/judges/${membershipId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function previewInvitation(token: string) {
  return apiFetch<InvitationPreview>(`/invitations/preview?token=${encodeURIComponent(token)}`);
}

export function respondToInvitation(token: string, accept: boolean) {
  return apiFetch<PublicEventMembership>('/invitations/respond', {
    method: 'POST',
    body: { token, accept },
  });
}

// --- Submissions ---

export function startSubmission(eventId: string) {
  return apiFetch<Submission>(`/events/${eventId}/submissions`, { method: 'POST' });
}

export function getMySubmission(eventId: string) {
  return apiFetch<Submission>(`/events/${eventId}/submissions/mine`);
}

export function listSubmittedForEvent(eventId: string) {
  return apiFetch<Submission[]>(`/events/${eventId}/submissions`);
}

export function listDraftsInProgress(eventId: string) {
  return apiFetch<DraftInProgressSummary[]>(`/events/${eventId}/submissions/drafts`);
}

export function getSubmission(id: string) {
  return apiFetch<Submission>(`/submissions/${id}`);
}

// --- Verification (Module 6) ---

export function listVerifications(eventId: string, checkStatus?: string, finalDecision?: string) {
  const params = new URLSearchParams();
  if (checkStatus) params.set('checkStatus', checkStatus);
  if (finalDecision) params.set('finalDecision', finalDecision);
  const qs = params.toString();
  return apiFetch<VerificationRow[]>(`/events/${eventId}/verifications${qs ? `?${qs}` : ''}`);
}

export type VerificationTriggerInput =
  | { scope: 'ALL'; includeAlreadyChecked?: boolean }
  | { scope: 'FILTER'; filter: { checkStatus?: string[]; finalDecision?: string[] } }
  | { scope: 'TARGETED'; submissionIds: string[] };

export function triggerVerificationRun(eventId: string, input: VerificationTriggerInput) {
  return apiFetch<{ queued: number }>(`/events/${eventId}/verifications/run`, {
    method: 'POST',
    body: input,
  });
}

export function reviewVerification(
  eventId: string,
  submissionId: string,
  input: { finalDecision: 'APPROVED' | 'DISQUALIFIED'; remarks?: string },
) {
  return apiFetch<{ finalDecision: string; finalDecisionRemarks: string | null }>(
    `/events/${eventId}/verifications/${submissionId}/review`,
    { method: 'POST', body: input },
  );
}

export function patchSubmission(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    repoUrl: string;
    demoVideoUrl: string;
    liveUrl: string;
    trackIds: string[];
  }>,
) {
  return apiFetch<Submission>(`/submissions/${id}`, { method: 'PATCH', body: input });
}

export function submitSubmission(id: string) {
  return apiFetch<Submission>(`/submissions/${id}/submit`, { method: 'POST' });
}

export function unsubmitSubmission(id: string) {
  return apiFetch<Submission>(`/submissions/${id}/unsubmit`, { method: 'POST' });
}

// --- Judge Assignment (Module 7) ---

export function listAssignableSubmissions(eventId: string) {
  return apiFetch<AssignableSubmission[]>(`/events/${eventId}/assignments/assignable-submissions`);
}

export function listAssignments(eventId: string) {
  return apiFetch<JudgeAssignmentRow[]>(`/events/${eventId}/assignments`);
}

export function listMyAssignments(eventId: string) {
  return apiFetch<MyAssignmentRow[]>(`/events/${eventId}/assignments/mine`);
}

export function assignmentProgress(eventId: string) {
  return apiFetch<JudgeProgress[]>(`/events/${eventId}/assignments/progress`);
}

export function manualAssign(eventId: string, submissionId: string, judgeIds: string[]) {
  return apiFetch<JudgeAssignmentRow[]>(`/events/${eventId}/assignments`, {
    method: 'POST',
    body: { submissionId, judgeIds },
  });
}

export function autoAssign(eventId: string, input: { reviewsPerProject: number; strategy: 'BY_TRACK' | 'RANDOM' }) {
  return apiFetch<{ created: number; shortfalls: Array<{ submissionId: string; assigned: number; needed: number }> }>(
    `/events/${eventId}/assignments/auto-assign`,
    { method: 'POST', body: input },
  );
}

export function transferAssignment(eventId: string, assignmentId: string, toJudgeId: string, remark: string) {
  return apiFetch<JudgeAssignmentRow>(`/events/${eventId}/assignments/${assignmentId}/transfer`, {
    method: 'POST',
    body: { toJudgeId, remark },
  });
}

// --- Rubric & Scoring (Module 8) ---

export function replaceRubric(
  eventId: string,
  input: {
    criteria: Array<{
      kind: RubricCriterionKind;
      label: string;
      description: string;
      weightPercent?: number;
      maxPoints?: number;
    }>;
    acknowledgeBonusOverage?: boolean;
  },
) {
  return apiFetch<RubricCriterion[]>(`/events/${eventId}/rubric-criteria`, {
    method: 'PUT',
    body: input,
  });
}

export function getForScoring(assignmentId: string) {
  return apiFetch<ScoringData>(`/assignments/${assignmentId}`);
}

export function saveScoreDraft(
  assignmentId: string,
  input: { scores?: Array<{ criterionId: string; value: number; note?: string }>; overallFeedback?: string },
) {
  return apiFetch<ScoringData>(`/assignments/${assignmentId}/scores`, { method: 'PATCH', body: input });
}

export function submitReview(assignmentId: string) {
  return apiFetch<ScoringData>(`/assignments/${assignmentId}/submit-review`, { method: 'POST' });
}

// --- Normalization (Module 9) ---

export function listNormalizationRuns(eventId: string) {
  return apiFetch<NormalizationRunSummary[]>(`/events/${eventId}/normalization-runs`);
}

export function triggerNormalizationRun(eventId: string) {
  return apiFetch<NormalizationRunDetail>(`/events/${eventId}/normalization-runs`, { method: 'POST' });
}

export function getNormalizationRunDetail(eventId: string, runId: string) {
  return apiFetch<NormalizationRunDetail>(`/events/${eventId}/normalization-runs/${runId}`);
}

export function getJudgeCalibrationProfile(userId: string) {
  return apiFetch<JudgeCalibrationProfile>(`/admin/judges/${userId}/calibration`);
}
