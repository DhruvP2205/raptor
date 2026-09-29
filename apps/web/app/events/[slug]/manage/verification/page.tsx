'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import {
  getEvent,
  listVerifications,
  reviewVerification,
  triggerVerificationRun,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { CheckStatus, PublicEvent, VerificationRow } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';

// docs/design/06-submission-verification.md Section 1 — exact tone
// mapping the doc specifies for each field.
const CHECK_STATUS_TONE: Record<CheckStatus, Tone> = {
  VERIFIED: 'success',
  SUSPICIOUS: 'live',
  REJECTED: 'danger',
  PRIVATE: 'danger',
  NON_GITHUB: 'danger',
  ERROR: 'danger',
  NOT_RUN: 'neutral',
};
const FINAL_DECISION_TONE: Record<VerificationRow['finalDecision'], Tone> = {
  APPROVED: 'success',
  DISQUALIFIED: 'danger',
  PENDING_REVIEW: 'live',
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 30000;

function OutsideWindowCommitsList({ commits }: { commits: VerificationRow['outsideWindowCommits'] }) {
  if (commits.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-ink">Commits outside the submission window</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {commits.map((c) => (
          <li key={c.sha} className="rounded border border-line bg-paper-raised px-2.5 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-ink-muted">{c.sha.slice(0, 7)}</code>
              <span className="font-mono text-ink-faint">{formatDateTime(c.timestamp)}</span>
            </div>
            <p className="mt-0.5 text-ink-muted">
              {c.message} — <span className="text-ink-faint">{c.author}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Content only, no <tr>/<td> wrapper — shared between the md+ table's
// expanded row and the mobile card's expanded section
// (FRONTEND-MEGA-DOC.md Part 2: one implementation, never redefined
// per layout).
function VerificationRowExpandedContent({
  row,
  eventId,
  onUpdated,
}: {
  row: VerificationRow;
  eventId: string;
  onUpdated: (r: VerificationRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmDisqualify, setConfirmDisqualify] = useState(false);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      const updated = await reviewVerification(eventId, row.submissionId, { finalDecision: 'APPROVED' });
      onUpdated({ ...row, finalDecision: 'APPROVED', finalDecisionRemarks: updated.finalDecisionRemarks });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisqualify(reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await reviewVerification(eventId, row.submissionId, {
        finalDecision: 'DISQUALIFIED',
        remarks: reason,
      });
      onUpdated({ ...row, finalDecision: 'DISQUALIFIED', finalDecisionRemarks: updated.finalDecisionRemarks });
      setConfirmDisqualify(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-xs text-ink-muted">
          <p>First commit: <span className="font-mono text-ink">{formatDateTime(row.firstCommitAt)}</span></p>
          <p className="mt-1">Last commit: <span className="font-mono text-ink">{formatDateTime(row.lastCommitAt)}</span></p>
          <p className="mt-1">
            Commits: <span className="font-mono text-ink">{row.totalCommits}</span> total,{' '}
            <span className="font-mono text-ink">{row.commitsInWindow}</span> in window
          </p>
          {row.finalDecisionRemarks && (
            <p className="mt-2">
              Reason on file: <span className="text-ink">{row.finalDecisionRemarks}</span>
            </p>
          )}
        </div>
        <OutsideWindowCommitsList commits={row.outsideWindowCommits} />
      </div>

      <ApiErrorAlert error={error} />
      <div className="mt-4 flex gap-2">
        <Button size="sm" loading={busy} onClick={handleApprove} disabled={row.finalDecision === 'APPROVED'}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmDisqualify(true)}
          disabled={row.finalDecision === 'DISQUALIFIED'}
        >
          Disqualify
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDisqualify}
        title="Disqualify this submission?"
        description="This removes the submission from judging and results. This can be undone by an admin, but won't happen automatically."
        confirmLabel="Disqualify submission"
        requireReason
        loading={busy}
        onConfirm={handleDisqualify}
        onCancel={() => setConfirmDisqualify(false)}
      />
    </>
  );
}

function VerificationRowExpanded(props: { row: VerificationRow; eventId: string; onUpdated: (r: VerificationRow) => void }) {
  return (
    <tr>
      <td colSpan={5} className="border-b border-line bg-paper-raised px-4 py-4">
        <VerificationRowExpandedContent {...props} />
      </td>
    </tr>
  );
}

export default function VerificationQueuePage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const { showToast } = useToast();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [rows, setRows] = useState<VerificationRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [checkStatusFilter, setCheckStatusFilter] = useState('');
  const [finalDecisionFilter, setFinalDecisionFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<Map<string, CheckStatus>>(new Map());
  const [justRerunWithManualDecision, setJustRerunWithManualDecision] = useState<Set<string>>(new Set());
  const [triggerError, setTriggerError] = useState<unknown>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function load(eventId: string) {
    return listVerifications(eventId, checkStatusFilter || undefined, finalDecisionFilter || undefined).then(
      setRows,
    );
  }

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return load(e.id);
      })
      .catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slug]);

  useEffect(() => {
    if (!event) return;
    load(event.id).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkStatusFilter, finalDecisionFilter]);

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  // docs/design/06-submission-verification.md Section 1 — "the affected
  // rows show a NOT_RUN -> in-progress transition... rest of the table
  // stays interactive" and "Run completes: a toast summarizes." This is
  // an async, worker-backed job with no push channel, so polling the
  // list is the only way to detect completion; capped at 30s so a
  // worker that's down (or, in this sandbox, doesn't exist) doesn't
  // spin forever.
  function pollForCompletion(eventId: string, affectedIds: string[], before: Map<string, CheckStatus>) {
    // Triggering a second run (e.g. clicking "Re-run all" again before
    // the first poll finished) would otherwise leave the earlier
    // interval running unreferenced — always clear before replacing.
    if (pollTimer.current) clearInterval(pollTimer.current);
    const startedAt = Date.now();
    pollTimer.current = setInterval(async () => {
      const latest = await listVerifications(eventId).catch(() => null);
      if (!latest) return;
      const stillPending = affectedIds.filter((id) => {
        const row = latest.find((r) => r.submissionId === id);
        return row && row.checkStatus === before.get(id);
      });
      const done = stillPending.length === 0 || Date.now() - startedAt > POLL_TIMEOUT_MS;
      if (done) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setPending(new Map());
        setRows(latest);
        const changed = affectedIds
          .map((id) => latest.find((r) => r.submissionId === id))
          .filter((r): r is VerificationRow => !!r && r.checkStatus !== before.get(r.submissionId));
        if (changed.length > 0) {
          const counts: Record<string, number> = {};
          for (const r of changed) counts[r.checkStatus] = (counts[r.checkStatus] ?? 0) + 1;
          const summary = Object.entries(counts)
            .map(([status, n]) => `${n} ${status.toLowerCase()}`)
            .join(', ');
          showToast(`${changed.length} checked — ${summary}.`);
        }
      } else {
        setRows(latest);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleTrigger(
    scope: 'ALL' | 'FILTER' | 'TARGETED',
    opts?: { includeAlreadyChecked?: boolean },
  ) {
    if (!event || !rows) return;
    setTriggerError(null);

    let affected: VerificationRow[];
    if (scope === 'TARGETED') {
      affected = rows.filter((r) => selected.has(r.submissionId));
    } else if (scope === 'FILTER') {
      affected = rows; // already filtered by the table's own active filter
    } else {
      affected = opts?.includeAlreadyChecked ? rows : rows.filter((r) => r.checkStatus === 'NOT_RUN');
    }
    if (affected.length === 0) return;

    const before = new Map(affected.map((r) => [r.submissionId, r.checkStatus]));
    setPending(before);
    // docs/design/06-submission-verification.md Section 1 — "Re-run
    // attempted on a submission with an existing manual finalDecision":
    // snapshot which of the affected rows already had a human decision
    // *before* this run, so the note only shows for those, and only
    // after this specific run (not permanently).
    setJustRerunWithManualDecision(
      new Set(affected.filter((r) => r.reviewedByUserId).map((r) => r.submissionId)),
    );

    try {
      if (scope === 'TARGETED') {
        await triggerVerificationRun(event.id, { scope, submissionIds: affected.map((r) => r.submissionId) });
      } else if (scope === 'FILTER') {
        await triggerVerificationRun(event.id, {
          scope,
          filter: {
            checkStatus: checkStatusFilter ? [checkStatusFilter as CheckStatus] : undefined,
            finalDecision: finalDecisionFilter ? [finalDecisionFilter as VerificationRow['finalDecision']] : undefined,
          },
        });
      } else {
        await triggerVerificationRun(event.id, { scope, includeAlreadyChecked: opts?.includeAlreadyChecked });
      }
      setSelected(new Set());
      pollForCompletion(event.id, affected.map((r) => r.submissionId), before);
    } catch (err) {
      setTriggerError(err);
      setPending(new Map());
    }
  }

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || !rows) return <PageSpinner />;

  // No dedicated backend signal for "token pool exhausted" (Section 5 of
  // the backend doc describes the condition but the API surfaces it
  // only as a run of ERROR results, not a distinct field) — inferred
  // client-side from a majority-ERROR pattern among checked rows.
  // TODO: undocumented decision, needs confirmation.
  const checked = rows.filter((r) => r.checkStatus !== 'NOT_RUN');
  const erroredCount = checked.filter((r) => r.checkStatus === 'ERROR').length;
  const tokensExhausted = checked.length >= 3 && erroredCount / checked.length > 0.5;

  return (
    <Container className="py-10">
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — verification</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Automated GitHub checks plus your manual decision — only <Badge tone="success">Approved</Badge>{' '}
        submissions are eligible for judge assignment.
      </p>

      {tokensExhausted && (
        <div className="mb-4">
          <Alert tone="danger">
            GitHub verification is degraded — no valid tokens available. Contact an admin.
          </Alert>
        </div>
      )}

      <ApiErrorAlert error={triggerError} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <Select value={checkStatusFilter} onChange={(e) => setCheckStatusFilter(e.target.value)} className="max-w-[10rem]">
            <option value="">All check statuses</option>
            {(['NOT_RUN', 'VERIFIED', 'SUSPICIOUS', 'REJECTED', 'PRIVATE', 'NON_GITHUB', 'ERROR'] as const).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={finalDecisionFilter} onChange={(e) => setFinalDecisionFilter(e.target.value)} className="max-w-[10rem]">
            <option value="">All decisions</option>
            {(['PENDING_REVIEW', 'APPROVED', 'DISQUALIFIED'] as const).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => handleTrigger('ALL', { includeAlreadyChecked: false })}>
              Re-run unchecked
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleTrigger('ALL', { includeAlreadyChecked: true })}>
              Re-run all
            </Button>
            {(checkStatusFilter || finalDecisionFilter) && (
              <Button size="sm" variant="secondary" onClick={() => handleTrigger('FILTER')}>
                Re-run filtered ({rows.length})
              </Button>
            )}
            {selected.size > 0 && (
              <Button size="sm" onClick={() => handleTrigger('TARGETED')}>
                Re-run selected ({selected.size})
              </Button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="pt-6">
            <EmptyState title="No submissions to verify yet." />
          </div>
        ) : (
          <>
            {/* FRONTEND-MEGA-DOC.md Part 2 — Table→Card: table at md+,
                stacked cards below it, never horizontal scroll as the
                only mobile adaptation. */}
            <table className="mt-2 hidden w-full text-sm md:table">
              <thead>
                <tr className="text-left text-xs text-ink-faint">
                  <th className="w-8 py-2"></th>
                  <th className="py-2">Submission</th>
                  <th className="py-2">Check status</th>
                  <th className="py-2">Decision</th>
                  <th className="w-8 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.submissionId}>
                    <tr
                      className="cursor-pointer border-b border-line hover:bg-paper-raised"
                      onClick={() => setExpanded((cur) => (cur === row.submissionId ? null : row.submissionId))}
                    >
                      <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.submissionId)}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.submissionId)) next.delete(row.submissionId);
                              else next.add(row.submissionId);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="py-2.5">
                        <p className="font-medium text-ink">{row.title || 'Untitled submission'}</p>
                        <p className="text-xs text-ink-muted">{row.submitterName ?? 'Unknown'}</p>
                        {justRerunWithManualDecision.has(row.submissionId) && !pending.has(row.submissionId) && (
                          <p className="mt-0.5 text-xs text-ink-faint">
                            Automated check re-run — your manual decision is unchanged.
                          </p>
                        )}
                      </td>
                      <td className="py-2.5">
                        {pending.has(row.submissionId) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                            <Spinner className="h-3.5 w-3.5" /> checking…
                          </span>
                        ) : (
                          <Badge tone={CHECK_STATUS_TONE[row.checkStatus]}>{row.checkStatus}</Badge>
                        )}
                      </td>
                      <td className="py-2.5">
                        <Badge tone={FINAL_DECISION_TONE[row.finalDecision]}>{row.finalDecision}</Badge>
                      </td>
                      <td className="py-2.5 text-ink-faint">{expanded === row.submissionId ? '▾' : '▸'}</td>
                    </tr>
                    {expanded === row.submissionId && (
                      <VerificationRowExpanded
                        row={row}
                        eventId={event.id}
                        onUpdated={(updated) =>
                          setRows((list) => (list ? list.map((r) => (r.submissionId === updated.submissionId ? updated : r)) : list))
                        }
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <div className="mt-2 flex flex-col gap-3 md:hidden">
              {rows.map((row) => (
                <Card key={row.submissionId} className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(row.submissionId)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.submissionId)) next.delete(row.submissionId);
                          else next.add(row.submissionId);
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setExpanded((cur) => (cur === row.submissionId ? null : row.submissionId))}
                    >
                      <p className="font-medium text-ink">{row.title || 'Untitled submission'}</p>
                      <p className="text-xs text-ink-muted">{row.submitterName ?? 'Unknown'}</p>
                      {justRerunWithManualDecision.has(row.submissionId) && !pending.has(row.submissionId) && (
                        <p className="mt-0.5 text-xs text-ink-faint">
                          Automated check re-run — your manual decision is unchanged.
                        </p>
                      )}
                    </button>
                    <span className="text-ink-faint">{expanded === row.submissionId ? '▾' : '▸'}</span>
                  </div>
                  <div className="flex gap-2">
                    {pending.has(row.submissionId) ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                        <Spinner className="h-3.5 w-3.5" /> checking…
                      </span>
                    ) : (
                      <Badge tone={CHECK_STATUS_TONE[row.checkStatus]}>{row.checkStatus}</Badge>
                    )}
                    <Badge tone={FINAL_DECISION_TONE[row.finalDecision]}>{row.finalDecision}</Badge>
                  </div>
                  {expanded === row.submissionId && (
                    <div className="mt-1 border-t border-line pt-3">
                      <VerificationRowExpandedContent
                        row={row}
                        eventId={event.id}
                        onUpdated={(updated) =>
                          setRows((list) => (list ? list.map((r) => (r.submissionId === updated.submissionId ? updated : r)) : list))
                        }
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </Card>
    </Container>
  );
}
