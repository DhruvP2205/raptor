'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Select } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  ApiError,
  assignmentProgress,
  autoAssign,
  getEvent,
  listAssignableSubmissions,
  listAssignments,
  listJudgeInvitations,
  manualAssign,
  transferAssignment,
  updateJudgeMembership,
} from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type {
  AssignableSubmission,
  AssignmentStatus,
  JudgeAssignmentRow,
  JudgeInvitation,
  JudgeProgress,
  PublicEvent,
} from '@raptor/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const ASSIGNMENT_STATUS_TONE: Record<AssignmentStatus, Tone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'live',
  COMPLETED: 'success',
  TRANSFERRED: 'neutral',
};

interface JudgeView {
  judgeId: string;
  membershipId: string;
  displayName: string;
  email: string;
  limit: number;
  hasOverride: boolean;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

function AutoAssignModal({
  open,
  hasTracks,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  hasTracks: boolean;
  loading: boolean;
  onConfirm: (reviewsPerProject: number, strategy: 'BY_TRACK' | 'RANDOM') => void;
  onCancel: () => void;
}) {
  const [reviewsPerProject, setReviewsPerProject] = useState(2);
  const [strategy, setStrategy] = useState<'BY_TRACK' | 'RANDOM'>(hasTracks ? 'BY_TRACK' : 'RANDOM');

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-assign-title"
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-line bg-white p-5 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auto-assign-title" className="font-display text-lg text-ink">
          Auto-assign judges
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Reviews per project" htmlFor="reviewsPerProject" required>
            <input
              id="reviewsPerProject"
              type="number"
              min={1}
              value={reviewsPerProject}
              onChange={(e) => setReviewsPerProject(Number(e.target.value))}
              className="w-full rounded border border-line bg-white px-3 py-2 text-sm"
            />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Strategy</legend>
            <div className="mt-2 flex flex-col gap-2 text-sm">
              <label className={`flex items-center gap-2 ${!hasTracks ? 'text-ink-placeholder' : ''}`}>
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === 'BY_TRACK'}
                  disabled={!hasTracks}
                  onChange={() => setStrategy('BY_TRACK')}
                />
                By track {!hasTracks && '(no tracks configured on this event)'}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="strategy"
                  checked={strategy === 'RANDOM'}
                  onChange={() => setStrategy('RANDOM')}
                />
                Random
              </label>
            </div>
          </fieldset>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" loading={loading} onClick={() => onConfirm(reviewsPerProject, strategy)}>
            Run auto-assign
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AssignmentBoardPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const { showToast } = useToast();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [submissions, setSubmissions] = useState<AssignableSubmission[] | null>(null);
  const [judgeInvitations, setJudgeInvitations] = useState<JudgeInvitation[] | null>(null);
  const [progress, setProgress] = useState<JudgeProgress[] | null>(null);
  const [allAssignments, setAllAssignments] = useState<JudgeAssignmentRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);
  const [autoAssignBusy, setAutoAssignBusy] = useState(false);
  const [autoAssignError, setAutoAssignError] = useState<unknown>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickedJudgeId, setPickedJudgeId] = useState('');
  const [assignError, setAssignError] = useState<Record<string, unknown>>({});
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<JudgeView | null>(null);
  const [transferToJudgeId, setTransferToJudgeId] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<unknown>(null);

  function reload(eventId: string) {
    return Promise.all([
      listAssignableSubmissions(eventId),
      listJudgeInvitations(eventId),
      assignmentProgress(eventId),
      listAssignments(eventId),
    ]).then(([subs, judges, prog, assigns]) => {
      setSubmissions(subs);
      setJudgeInvitations(judges);
      setProgress(prog);
      setAllAssignments(assigns);
    });
  }

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return reload(e.id);
      })
      .catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || !submissions || !judgeInvitations || !progress || !allAssignments) return <PageSpinner />;

  const acceptedJudges = judgeInvitations.filter((j) => j.invitationStatus === 'ACCEPTED');
  const judgeViews: JudgeView[] = acceptedJudges.map((j) => {
    const p = progress.find((pr) => pr.judgeId === j.userId);
    return {
      judgeId: j.userId,
      membershipId: j.id,
      displayName: j.user.displayName,
      email: j.user.email,
      limit: j.projectLimitOverride ?? event.maxProjectsPerJudge,
      hasOverride: j.projectLimitOverride != null,
      total: p?.total ?? 0,
      completed: p?.completed ?? 0,
      inProgress: p?.inProgress ?? 0,
      pending: p?.pending ?? 0,
    };
  });

  async function handleAutoAssign(reviewsPerProject: number, strategy: 'BY_TRACK' | 'RANDOM') {
    setAutoAssignBusy(true);
    setAutoAssignError(null);
    try {
      const result = await autoAssign(event!.id, { reviewsPerProject, strategy });
      setAutoAssignOpen(false);
      await reload(event!.id);
      const shortfallNote =
        result.shortfalls.length > 0 ? ` (${result.shortfalls.length} submission(s) couldn't get full coverage)` : '';
      showToast(`${result.created} assignments created.${shortfallNote}`);
    } catch (err) {
      setAutoAssignError(err);
    } finally {
      setAutoAssignBusy(false);
    }
  }

  async function handleManualAssign(submissionId: string) {
    if (!pickedJudgeId) return;
    setAssignBusy(submissionId);
    setAssignError((prev) => ({ ...prev, [submissionId]: null }));
    try {
      await manualAssign(event!.id, submissionId, [pickedJudgeId]);
      setPickerFor(null);
      setPickedJudgeId('');
      await reload(event!.id);
    } catch (err) {
      setAssignError((prev) => ({ ...prev, [submissionId]: err }));
    } finally {
      setAssignBusy(null);
    }
  }

  async function handleRaiseLimit(judge: JudgeView) {
    await updateJudgeMembership(event!.id, judge.membershipId, { projectLimitOverride: judge.limit + 1 });
    await reload(event!.id);
  }

  async function handleTransfer(reason?: string) {
    if (!transferTarget || !transferToJudgeId || !reason || !allAssignments) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const incomplete = allAssignments.filter(
        (a) => a.judgeId === transferTarget.judgeId && (a.status === 'PENDING' || a.status === 'IN_PROGRESS'),
      );
      for (const a of incomplete) {
        await transferAssignment(event!.id, a.id, transferToJudgeId, reason);
      }
      setTransferTarget(null);
      setTransferToJudgeId('');
      await reload(event!.id);
      showToast(`Transferred ${incomplete.length} assignment(s).`);
    } catch (err) {
      setTransferError(err);
    } finally {
      setTransferBusy(false);
    }
  }

  const hasTracks = (event.tracks?.length ?? 0) > 0;

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{event.name} — assignments</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Only <Badge tone="success">Approved</Badge> submissions and accepted judges are eligible.
          </p>
        </div>
        <Button size="sm" onClick={() => setAutoAssignOpen(true)}>
          Auto-assign
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <h2 className="font-display text-lg text-ink">Approved submissions</h2>
          {submissions.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No approved submissions yet"
                description="Check the verification queue."
              />
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {submissions.map((s) => {
                const eligibleJudges = acceptedJudges.filter(
                  (j) => !s.assignedJudges.some((a) => a.judgeId === j.userId),
                );
                return (
                  <li key={s.submissionId} className="rounded border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{s.title || 'Untitled submission'}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPickerFor(pickerFor === s.submissionId ? null : s.submissionId);
                          setPickedJudgeId('');
                        }}
                      >
                        Assign judge
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.assignedJudges.length === 0 ? (
                        <span className="text-xs text-ink-faint">No judges assigned yet.</span>
                      ) : (
                        s.assignedJudges.map((a) => (
                          <Badge key={a.assignmentId} tone={ASSIGNMENT_STATUS_TONE[a.status]}>
                            {a.displayName}
                          </Badge>
                        ))
                      )}
                    </div>

                    {pickerFor === s.submissionId && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                        <div className="min-w-[12rem]">
                          <Select value={pickedJudgeId} onChange={(e) => setPickedJudgeId(e.target.value)}>
                            <option value="">Select a judge…</option>
                            {eligibleJudges.map((j) => (
                              <option key={j.userId} value={j.userId}>
                                {j.user.displayName}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          loading={assignBusy === s.submissionId}
                          disabled={!pickedJudgeId}
                          onClick={() => handleManualAssign(s.submissionId)}
                        >
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPickerFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}

                    {assignError[s.submissionId] instanceof ApiError &&
                      (assignError[s.submissionId] as ApiError).code === 'JUDGE_OVER_CAPACITY' && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-danger">
                          <span>This judge is at their limit ({pickedJudgeId ? judgeViews.find((j) => j.judgeId === pickedJudgeId)?.limit : '?'}).</span>
                          <button
                            type="button"
                            className="font-medium underline"
                            onClick={async () => {
                              const jv = judgeViews.find((j) => j.judgeId === pickedJudgeId);
                              if (jv) {
                                await handleRaiseLimit(jv);
                                setAssignError((prev) => ({ ...prev, [s.submissionId]: null }));
                              }
                            }}
                          >
                            Raise this judge&apos;s limit
                          </button>
                        </div>
                      )}
                    {assignError[s.submissionId] instanceof ApiError &&
                      (assignError[s.submissionId] as ApiError).code !== 'JUDGE_OVER_CAPACITY' && (
                        <p className="mt-2 text-xs font-medium text-danger">
                          {(assignError[s.submissionId] as ApiError).message}
                        </p>
                      )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <h2 className="font-display text-lg text-ink">Judges</h2>
          {judgeViews.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No judges have accepted an invitation yet." />
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {judgeViews.map((j) => (
                <li key={j.judgeId} className="rounded border border-line p-3 text-sm">
                  <p className="font-medium text-ink">{j.displayName}</p>
                  <p className="font-mono text-xs text-ink-faint">
                    {j.total}/{j.limit} assigned
                    {j.hasOverride && ' (override)'}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {j.completed} completed · {j.inProgress} in progress · {j.pending} pending
                  </p>
                  {(j.pending > 0 || j.inProgress > 0) && (
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-accent-to underline"
                      onClick={() => setTransferTarget(j)}
                    >
                      Transfer incomplete assignments
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AutoAssignModal
        open={autoAssignOpen}
        hasTracks={hasTracks}
        loading={autoAssignBusy}
        onConfirm={handleAutoAssign}
        onCancel={() => setAutoAssignOpen(false)}
      />
      {autoAssignOpen && <ApiErrorAlert error={autoAssignError} />}

      <ConfirmDialog
        open={!!transferTarget}
        title={`Transfer ${transferTarget?.displayName}'s incomplete assignments?`}
        description="This note will be visible to any organizer considering this judge for a future event."
        confirmLabel="Transfer assignments"
        requireReason
        extraValid={!!transferToJudgeId}
        loading={transferBusy}
        onConfirm={handleTransfer}
        onCancel={() => {
          setTransferTarget(null);
          setTransferToJudgeId('');
          setTransferError(null);
        }}
      >
        {transferTarget && (
          <div className="mt-4">
            <Field label="Transfer to" htmlFor="transfer-to-judge" required>
              <Select
                id="transfer-to-judge"
                value={transferToJudgeId}
                onChange={(e) => setTransferToJudgeId(e.target.value)}
              >
                <option value="">Select a judge…</option>
                {judgeViews
                  .filter((j) => j.judgeId !== transferTarget.judgeId)
                  .map((j) => (
                    <option key={j.judgeId} value={j.judgeId}>
                      {j.displayName}
                    </option>
                  ))}
              </Select>
            </Field>
            <ApiErrorAlert error={transferError} />
          </div>
        )}
      </ConfirmDialog>
    </Container>
  );
}
