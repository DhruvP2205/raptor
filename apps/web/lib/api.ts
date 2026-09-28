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
  PublishMode,
  PublishedResultVersion,
  PublishedResultVersionSummary,
  ResultCorrectionType,
  ResultsDraft,
  ResultsPreview,
  RubricCriterion,
  RubricCriterionKind,
  ScoringData,
  PowChallenge,
  PublicShortlist,
  ShortlistSuggestion,
  ShortlistEntryRow,
  VoteAbuseFlag,
  VotingCaptchaChallenge,
  VotingCorrectionType,
  VotingEligibility,
  VotingEligibilityMode,
  VotingResultVersion,
  VotingResultVersionSummary,
  VotingRound,
  VotingTallyEntry,
  Certificate,
  CertificateRole,
  CertificateTemplate,
  GalleryCertificate,
  PublicCertificate,
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

// --- Results & Rankings (Module 10) ---

export function createResultsDraft(eventId: string, input: { normalizationRunId?: string; publishMode?: PublishMode }) {
  return apiFetch<ResultsDraft>(`/events/${eventId}/results/drafts`, { method: 'POST', body: input });
}

export function listResultsDrafts(eventId: string) {
  return apiFetch<ResultsDraft[]>(`/events/${eventId}/results/drafts`);
}

export function updateResultsDraft(
  eventId: string,
  draftId: string,
  input: { draftStatus?: ResultsDraft['draftStatus']; publishMode?: PublishMode },
) {
  return apiFetch<ResultsDraft>(`/events/${eventId}/results/drafts/${draftId}`, { method: 'PATCH', body: input });
}

export function previewResultsDraft(eventId: string, draftId: string) {
  return apiFetch<ResultsPreview>(`/events/${eventId}/results/drafts/${draftId}/preview`);
}

export function publishResultsDraft(eventId: string, draftId: string) {
  return apiFetch<PublishedResultVersion>(`/events/${eventId}/results/drafts/${draftId}/publish`, {
    method: 'POST',
    body: { confirm: true },
  });
}

export function listResultVersions(eventId: string) {
  return apiFetch<PublishedResultVersionSummary[]>(`/events/${eventId}/results/versions`);
}

export function getResultVersionDetail(eventId: string, versionId: string) {
  return apiFetch<PublishedResultVersion>(`/events/${eventId}/results/versions/${versionId}`);
}

export function unpublishResultVersion(eventId: string, versionId: string, reason: string) {
  return apiFetch<PublishedResultVersionSummary>(`/events/${eventId}/results/versions/${versionId}/unpublish`, {
    method: 'POST',
    body: { reason },
  });
}

export function createResultCorrection(
  eventId: string,
  versionId: string,
  input: { type: ResultCorrectionType; submissionId: string; reason: string; newRank?: number; displayScore?: number },
) {
  return apiFetch<PublishedResultVersion>(`/events/${eventId}/results/versions/${versionId}/corrections`, {
    method: 'POST',
    body: input,
  });
}

// Public — no organizer access required, mirrors the backend's
// deliberately separate PublicResultsController.
export function getPublicResults(eventId: string) {
  return apiFetch<PublishedResultVersion | null>(`/events/${eventId}/results`);
}

// --- Voting (Module 11) — organizer routes ---

export function setVotingEligibilityMode(eventId: string, mode: VotingEligibilityMode) {
  return apiFetch<{ votingEligibilityMode: VotingEligibilityMode }>(`/events/${eventId}/voting/eligibility-mode`, {
    method: 'POST',
    body: { mode },
  });
}

export function createInitialVotingRound(eventId: string) {
  return apiFetch<VotingRound>(`/events/${eventId}/voting/rounds`, { method: 'POST' });
}

export function listVotingRounds(eventId: string) {
  return apiFetch<VotingRound[]>(`/events/${eventId}/voting/rounds`);
}

export function getCurrentVotingRound(eventId: string) {
  return apiFetch<VotingRound>(`/events/${eventId}/voting/rounds/current`);
}

export function restartVotingRound(
  eventId: string,
  input: { reason: string; votingOpensAt: string; votingClosesAt: string; votingWinnerAnnounceAt: string },
) {
  return apiFetch<VotingRound>(`/events/${eventId}/voting/rounds/restart`, { method: 'POST', body: input });
}

export function getShortlistSuggestions(eventId: string, normalizationRunId?: string) {
  const query = normalizationRunId ? `?normalizationRunId=${encodeURIComponent(normalizationRunId)}` : '';
  return apiFetch<ShortlistSuggestion[]>(`/events/${eventId}/voting/shortlist/suggestions${query}`);
}

export function getShortlistEntries(eventId: string, roundId: string) {
  return apiFetch<ShortlistEntryRow[]>(`/events/${eventId}/voting/rounds/${roundId}/shortlist`);
}

export function finalizeShortlist(eventId: string, roundId: string, submissionIds: string[]) {
  return apiFetch<ShortlistEntryRow[]>(`/events/${eventId}/voting/rounds/${roundId}/shortlist`, {
    method: 'POST',
    body: { submissionIds },
  });
}

export function correctShortlistEntry(
  eventId: string,
  roundId: string,
  entryId: string,
  input: { newSubmissionId: string; reason: string },
) {
  return apiFetch<ShortlistEntryRow>(`/events/${eventId}/voting/rounds/${roundId}/shortlist/${entryId}/corrections`, {
    method: 'POST',
    body: input,
  });
}

export function getLiveTally(eventId: string, roundId: string) {
  return apiFetch<VotingTallyEntry[]>(`/events/${eventId}/voting/rounds/${roundId}/tally`);
}

export function listAbuseFlags(eventId: string) {
  return apiFetch<VoteAbuseFlag[]>(`/events/${eventId}/voting/abuse-flags`);
}

export function reviewAbuseFlag(
  eventId: string,
  flagId: string,
  input: { action: 'CLEAR' | 'BAN'; banReason?: string; banUserIds?: string[]; clearNote?: string },
) {
  return apiFetch<VoteAbuseFlag>(`/events/${eventId}/voting/abuse-flags/${flagId}/review`, { method: 'POST', body: input });
}

export function publishVotingResults(eventId: string) {
  return apiFetch<VotingResultVersion>(`/events/${eventId}/voting/results/publish`, { method: 'POST', body: { confirm: true } });
}

export function listVotingResultVersions(eventId: string) {
  return apiFetch<VotingResultVersionSummary[]>(`/events/${eventId}/voting/results/versions`);
}

export function getVotingResultVersionDetail(eventId: string, versionId: string) {
  return apiFetch<VotingResultVersion>(`/events/${eventId}/voting/results/versions/${versionId}`);
}

export function unpublishVotingResults(eventId: string, versionId: string, reason: string) {
  return apiFetch<VotingResultVersionSummary>(`/events/${eventId}/voting/results/versions/${versionId}/unpublish`, {
    method: 'POST',
    body: { reason },
  });
}

export function createVotingCorrection(
  eventId: string,
  versionId: string,
  input: { type: VotingCorrectionType; submissionId: string; reason: string; newSubmissionId?: string },
) {
  return apiFetch<VotingResultVersion>(`/events/${eventId}/voting/results/versions/${versionId}/corrections`, {
    method: 'POST',
    body: input,
  });
}

// --- Voting (Module 11) — public routes ---

export function getPublicShortlist(eventId: string) {
  return apiFetch<PublicShortlist | null>(`/events/${eventId}/voting/shortlist`);
}

export function getPublicVotingResults(eventId: string) {
  return apiFetch<VotingResultVersion | null>(`/events/${eventId}/voting/results`);
}

export function getMyVotingEligibility(eventId: string) {
  return apiFetch<VotingEligibility>(`/events/${eventId}/voting/my-eligibility`);
}

// --- Voting (Module 11) — vote casting (any authenticated user) ---

export function getPowChallenge(eventId: string) {
  return apiFetch<PowChallenge>(`/events/${eventId}/voting/pow-challenge`);
}

export function getVotingCaptchaChallenge(eventId: string) {
  return apiFetch<VotingCaptchaChallenge>(`/events/${eventId}/voting/captcha-challenge`);
}

export function castVote(
  eventId: string,
  input: { submissionId: string; powChallengeId: string; powNonce: string; captchaChallengeId?: string; captchaAnswer?: string },
) {
  return apiFetch<{ ok: true }>(`/events/${eventId}/voting/votes`, { method: 'POST', body: input });
}

// --- Certificates (Module 12) — organizer ---

export function enableCertificates(eventId: string) {
  return apiFetch<{ certificatesEnabled: boolean; certificatesEnabledAt: string }>(`/events/${eventId}/certificates/enable`, {
    method: 'POST',
  });
}

export function getCertificateTemplate(eventId: string) {
  return apiFetch<CertificateTemplate>(`/events/${eventId}/certificates/template`);
}

export function upsertCertificateTemplate(eventId: string, svgMarkup: string) {
  return apiFetch<CertificateTemplate>(`/events/${eventId}/certificates/template`, {
    method: 'PUT',
    body: { svgMarkup },
  });
}

export function manualIssueCertificate(eventId: string, input: { userId: string; role: CertificateRole; reason: string }) {
  return apiFetch<Certificate>(`/events/${eventId}/certificates/issue`, { method: 'POST', body: input });
}

// --- Certificates (Module 12) — self-service ---

export function generateMyCertificates(eventId: string) {
  return apiFetch<Certificate[]>(`/events/${eventId}/certificates/mine`, { method: 'POST' });
}

export function listMyCertificates(eventId: string) {
  return apiFetch<Certificate[]>(`/events/${eventId}/certificates/mine`);
}

// --- Certificates (Module 12) — public ---

export function getPublicCertificate(id: string) {
  return apiFetch<PublicCertificate>(`/certificates/${id}`);
}

export function getUserCertificateGallery(userId: string) {
  return apiFetch<GalleryCertificate[]>(`/users/${userId}/certificates`);
}

// Direct browser navigation (not fetch) — the session cookie is
// SameSite=Lax, which is sent on a top-level GET navigation like this
// even cross-origin, so the API can authorize the download without any
// blob/fetch plumbing on this side.
export function certificateDownloadUrl(id: string): string {
  return `${API_URL}/certificates/${id}/download`;
}
