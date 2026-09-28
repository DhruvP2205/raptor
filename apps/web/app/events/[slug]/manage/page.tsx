'use client';

import { useOrganizerShell } from '@/components/events/OrganizerShellContext';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';
import type { EventPhase, OrganizerSummary } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// design/15-organizer-shell.md Section 3 — used both to decide whether
// a phase has "reached or passed" a given point (for the recommended
// -action banner) and nowhere else; not a general-purpose export since
// no other screen needs phase ordering today.
const PHASE_ORDER: EventPhase[] = [
  'NOT_STARTED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'SUBMISSIONS_OPEN',
  'SUBMISSIONS_CLOSED',
  'JUDGING',
  'JUDGING_CLOSED',
  'RESULTS_ANNOUNCED',
  'VOTING_OPEN',
  'VOTING_CLOSED',
  'VOTING_WINNER_ANNOUNCED',
];
function reachedPhase(current: EventPhase | null, target: EventPhase): boolean {
  if (!current) return false;
  return PHASE_ORDER.indexOf(current) >= PHASE_ORDER.indexOf(target);
}

function RecommendedActionBanner({ phase, summary, slug }: { phase: EventPhase | null; summary: OrganizerSummary; slug: string }) {
  if (phase === 'JUDGING_CLOSED' && summary.normalization && !summary.normalization.lastRunAt) {
    return (
      <Alert tone="warning" className="mb-6">
        Judging has closed. Run normalization to start building results.{' '}
        <Link href={`/events/${slug}/manage/normalization`} className="font-medium underline">
          Go to Normalization
        </Link>
      </Alert>
    );
  }
  if (reachedPhase(phase, 'RESULTS_ANNOUNCED') && summary.results && summary.results.state !== 'PUBLISHED') {
    return (
      <Alert tone="warning" className="mb-6">
        Results are drafted but not published yet.{' '}
        <Link href={`/events/${slug}/manage/results`} className="font-medium underline">
          Go to Results
        </Link>
      </Alert>
    );
  }
  return null;
}

function StatusCard({
  title,
  href,
  loading,
  failed,
  onRetry,
  children,
}: {
  title: string;
  href: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <Card className="flex h-full flex-col gap-2 transition-colors hover:border-ink-faint">
        <p className="font-display text-base text-ink">{title}</p>
        {loading ? (
          <Skeleton className="h-5 w-3/4" />
        ) : failed ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-danger">Couldn&apos;t load</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.preventDefault();
                onRetry();
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="text-sm text-ink-muted">{children}</div>
        )}
      </Card>
    </Link>
  );
}

export default function OrganizerOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { event, summary, refresh } = useOrganizerShell();

  if (!event || !summary) {
    return (
      <Container className="py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <Card key={i} className="flex h-24 flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-3/4" />
            </Card>
          ))}
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <h1 className="mb-6 font-display text-2xl text-ink">Overview</h1>

      <RecommendedActionBanner phase={event.phase} summary={summary} slug={slug} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          title="Tracks & prizes"
          href={`/events/${slug}/manage/tracks-prizes`}
          loading={false}
          failed={!summary.tracksPrizes}
          onRetry={refresh}
        >
          {summary.tracksPrizes && (
            <>
              {summary.tracksPrizes.tracksCount} tracks · {summary.tracksPrizes.prizesCount} prizes
            </>
          )}
        </StatusCard>

        <StatusCard
          title="Judges"
          href={`/events/${slug}/manage/judges`}
          loading={false}
          failed={!summary.judges}
          onRetry={refresh}
        >
          {summary.judges && (
            <>
              {summary.judges.accepted} accepted · {summary.judges.pending} pending · {summary.judges.declined} declined
            </>
          )}
        </StatusCard>

        <StatusCard
          title="Rubric"
          href={`/events/${slug}/manage/rubric`}
          loading={false}
          failed={!summary.rubric}
          onRetry={refresh}
        >
          {summary.rubric &&
            (summary.rubric.configured ? (
              <>
                {summary.rubric.scoringCount} scoring criteria · {summary.rubric.bonusCount} bonus tracks
              </>
            ) : (
              'Not configured yet'
            ))}
        </StatusCard>

        <StatusCard
          title="Submissions"
          href={`/events/${slug}/manage/submissions`}
          loading={false}
          failed={!summary.submissions}
          onRetry={refresh}
        >
          {summary.submissions && (
            summary.submissions.finalizedCount > 0
              ? <>{summary.submissions.finalizedCount} finalized</>
              : 'None yet'
          )}
        </StatusCard>

        <StatusCard
          title="Verification"
          href={`/events/${slug}/manage/verification`}
          loading={false}
          failed={!summary.verification}
          onRetry={refresh}
        >
          {summary.verification && (
            <span className="inline-flex items-center gap-1.5">
              {summary.verification.approved} approved · {summary.verification.pendingReview} pending review ·{' '}
              {summary.verification.disqualified} disqualified
              {summary.verification.pendingReview > 0 && <Badge tone="live">Needs attention</Badge>}
            </span>
          )}
        </StatusCard>

        <StatusCard
          title="Assignment"
          href={`/events/${slug}/manage/assignments`}
          loading={false}
          failed={!summary.assignment}
          onRetry={refresh}
        >
          {summary.assignment && (
            summary.assignment.unassignedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                {summary.assignment.unassignedCount} unassigned <Badge tone="live">Needs attention</Badge>
              </span>
            ) : (
              <>
                {summary.assignment.assignedCount}/{summary.assignment.totalSubmissions} submissions assigned ·{' '}
                {summary.assignment.avgReviewsPerSubmission} reviews each
              </>
            )
          )}
        </StatusCard>

        <StatusCard
          title="Progress"
          href={`/events/${slug}/manage/judging-progress`}
          loading={false}
          failed={!summary.progress}
          onRetry={refresh}
        >
          {summary.progress && (
            <>
              {summary.progress.percentComplete}% complete · {summary.progress.judgesNotStarted} judges not started
            </>
          )}
        </StatusCard>

        <StatusCard
          title="Normalization"
          href={`/events/${slug}/manage/normalization`}
          loading={false}
          failed={!summary.normalization}
          onRetry={refresh}
        >
          {summary.normalization &&
            (summary.normalization.lastRunAt ? (
              <>Last run {formatDateTime(summary.normalization.lastRunAt)}</>
            ) : summary.normalization.judgingStillOpen ? (
              'Not yet run — judging still open'
            ) : (
              'Not yet run'
            ))}
        </StatusCard>

        <StatusCard
          title="Results"
          href={`/events/${slug}/manage/results`}
          loading={false}
          failed={!summary.results}
          onRetry={refresh}
        >
          {summary.results &&
            (summary.results.state === 'PUBLISHED'
              ? 'Published'
              : summary.results.state === 'DRAFT'
                ? 'Draft in progress'
                : 'Not started')}
        </StatusCard>

        <StatusCard
          title="Voting"
          href={`/events/${slug}/manage/voting`}
          loading={false}
          failed={!summary.voting}
          onRetry={refresh}
        >
          {summary.voting &&
            (summary.voting.state === 'OPEN'
              ? <>Round {summary.voting.roundNumber} open · closes {formatDateTime(summary.voting.votingClosesAt!)}</>
              : summary.voting.state === 'CLOSED'
                ? <>Round {summary.voting.roundNumber} closed</>
                : 'Not started')}
        </StatusCard>

        <StatusCard
          title="Certificates"
          href={`/events/${slug}/manage/certificates`}
          loading={false}
          failed={!summary.certificates}
          onRetry={refresh}
        >
          {summary.certificates &&
            (summary.certificates.enabled ? (
              <>Enabled — {summary.certificates.issuedCount} issued</>
            ) : (
              'Not enabled yet'
            ))}
        </StatusCard>
      </div>
    </Container>
  );
}
