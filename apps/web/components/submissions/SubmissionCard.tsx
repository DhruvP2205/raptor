import { Alert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/format';
import type { Submission } from '@raptor/shared';

// docs/design/05-submission-management.md Section 4 — verification
// status visible to organizer/admin only; the backend only ever
// populates `verification` for that viewer in the first place, so this
// component doesn't need its own visibility check, just a render.
const VERIFICATION_TONE: Record<string, Tone> = {
  PENDING_REVIEW: 'live',
  APPROVED: 'success',
  DISQUALIFIED: 'danger',
};
const VERIFICATION_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  DISQUALIFIED: 'Disqualified',
};

// Read-only rendering of a finalized/draft submission — used by both
// the submission editor's preview and the standalone /submissions/[id]
// detail view, so organizer and owner see identical output.
export function SubmissionCard({ submission }: { submission: Submission }) {
  return (
    <div className="flex flex-col gap-4">
      {submission.verification && (
        <Alert tone="neutral" className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">Verification (organizer view):</span>
          <Badge tone={VERIFICATION_TONE[submission.verification.finalDecision]}>
            {VERIFICATION_LABEL[submission.verification.finalDecision]}
          </Badge>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={submission.isDraft ? 'neutral' : 'success'}>
          {submission.isDraft ? 'Draft' : 'Submitted'}
        </Badge>
        <Badge tone="neutral">{submission.submissionType === 'TEAM' ? 'Team' : 'Solo'}</Badge>
        {submission.submitterName && (
          <span className="text-sm text-ink-muted">by {submission.submitterName}</span>
        )}
        {submission.submittedAt && (
          <span className="font-mono text-xs text-ink-faint">
            Last submitted {formatDateTime(submission.submittedAt)}
          </span>
        )}
      </div>

      <h1 className="font-display text-2xl text-ink">{submission.title || 'Untitled submission'}</h1>

      {submission.descriptionHtml && (
        <div className="prose-content" dangerouslySetInnerHTML={{ __html: submission.descriptionHtml }} />
      )}

      <dl className="flex flex-col gap-1 text-sm">
        {submission.repoUrl && (
          <div className="flex gap-2">
            <dt className="text-ink-muted">Repo</dt>
            <dd>
              <a href={submission.repoUrl} className="text-accent underline" target="_blank" rel="noreferrer">
                {submission.repoUrl}
              </a>
            </dd>
          </div>
        )}
        {submission.demoVideoUrl && (
          <div className="flex gap-2">
            <dt className="text-ink-muted">Demo video</dt>
            <dd>
              <a href={submission.demoVideoUrl} className="text-accent underline" target="_blank" rel="noreferrer">
                {submission.demoVideoUrl}
              </a>
            </dd>
          </div>
        )}
        {submission.liveUrl && (
          <div className="flex gap-2">
            <dt className="text-ink-muted">Live</dt>
            <dd>
              <a href={submission.liveUrl} className="text-accent underline" target="_blank" rel="noreferrer">
                {submission.liveUrl}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
