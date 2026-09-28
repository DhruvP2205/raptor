'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  getEvent,
  getJudgeCalibrationProfile,
  getNormalizationRunDetail,
  listNormalizationRuns,
  triggerNormalizationRun,
} from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type {
  JudgeCalibrationProfile,
  NormalizationRunDetail,
  NormalizationRunSummary,
  PublicEvent,
} from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// A judge with several assignments in the same run has identical frozen
// calibration fields across all of them (they're a snapshot of that
// judge's state at this one run, not per-submission) — first occurrence
// represents the judge.
function dedupeByJudge(rows: NormalizationRunDetail['judgeScores']) {
  const seen = new Set<string>();
  const out: NormalizationRunDetail['judgeScores'] = [];
  for (const row of rows) {
    if (seen.has(row.judgeAssignment.judgeId)) continue;
    seen.add(row.judgeAssignment.judgeId);
    out.push(row);
  }
  return out;
}

export default function NormalizationPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [runs, setRuns] = useState<NormalizationRunSummary[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NormalizationRunDetail | null>(null);
  const [calibration, setCalibration] = useState<Record<string, JudgeCalibrationProfile>>({});
  const [error, setError] = useState<unknown>(null);
  const [detailError, setDetailError] = useState<unknown>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<unknown>(null);

  const loadRuns = useCallback((eventId: string) => {
    return listNormalizationRuns(eventId).then((list) => {
      setRuns(list);
      return list;
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        const list = await loadRuns(e.id);
        if (list.length > 0) setSelectedRunId(list[0].id);
      })
      .catch(setError);
  }, [ready, slug, loadRuns]);

  useEffect(() => {
    if (!event || !selectedRunId) {
      setDetail(null);
      return;
    }
    setDetailError(null);
    getNormalizationRunDetail(event.id, selectedRunId)
      .then((d) => {
        setDetail(d);
        // Live figures alongside this run's frozen snapshot (design doc
        // Section 1) — one lookup per distinct judge in the run, via the
        // platform-wide (not event-scoped) calibration endpoint.
        const judgeIds = [...new Set(d.judgeScores.map((js) => js.judgeAssignment.judgeId))];
        Promise.all(
          judgeIds.map((id) =>
            getJudgeCalibrationProfile(id)
              .then((profile) => [id, profile] as const)
              .catch(() => null),
          ),
        ).then((pairs) => {
          const map: Record<string, JudgeCalibrationProfile> = {};
          for (const pair of pairs) {
            if (pair) map[pair[0]] = pair[1];
          }
          setCalibration(map);
        });
      })
      .catch(setDetailError);
  }, [event, selectedRunId]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || !runs) return <PageSpinner />;

  const now = Date.now();
  const closesAt = new Date(event.judgingClosesAt).getTime();
  const announceAt = new Date(event.resultsAnnounceAt).getTime();
  // docs/stages/09-normalization.md D89 — unconditional lock at
  // resultsAnnounceAt, no admin override; enforced again server-side on
  // every trigger regardless of what this button shows.
  const windowState: 'before' | 'valid' | 'after' = now < closesAt ? 'before' : now >= announceAt ? 'after' : 'valid';

  async function handleTrigger() {
    setTriggering(true);
    setTriggerError(null);
    try {
      const created = await triggerNormalizationRun(event!.id);
      await loadRuns(event!.id);
      setSelectedRunId(created.id);
    } catch (err) {
      setTriggerError(err);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — normalization</h1>
      <p className="mb-6 text-sm text-ink-muted">Removes judge-to-judge scoring bias before ranking submissions.</p>

      <Card className="mb-6">
        {windowState === 'before' && <Alert tone="neutral">Judging hasn&apos;t closed yet.</Alert>}
        {windowState === 'after' && (
          <Alert tone="neutral">Normalization is locked — results have been announced.</Alert>
        )}
        {windowState === 'valid' && (
          <div>
            <Button loading={triggering} onClick={handleTrigger}>
              Run normalization
            </Button>
            {triggerError !== null && (
              <div className="mt-2">
                <ApiErrorAlert error={triggerError} />
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <h2 className="mb-3 font-display text-lg text-ink">Run history</h2>
          {runs.length === 0 ? (
            <EmptyState title="No normalization runs yet." />
          ) : (
            <ul className="flex flex-col gap-1">
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    onClick={() => setSelectedRunId(run.id)}
                    className={`w-full rounded px-2 py-1.5 text-left font-mono text-xs ${
                      run.id === selectedRunId
                        ? 'bg-accent-soft text-accent'
                        : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
                    }`}
                  >
                    {formatTimestamp(run.runAt)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          {detailError !== null && <Alert tone="danger">Couldn&apos;t load that run.</Alert>}
          {selectedRunId && !detail && detailError === null && <PageSpinner />}
          {detail && (
            <>
              <Card>
                <h2 className="mb-3 font-display text-lg text-ink">Normalization proof</h2>
                {detail.normalizedScores.length === 0 ? (
                  <EmptyState title="No completed reviews to normalize yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                          <th className="py-2 pr-3">Submission</th>
                          <th className="py-2 pr-3">Raw avg</th>
                          <th className="py-2 pr-3">Raw rank</th>
                          <th className="py-2 pr-3">Normalized score</th>
                          <th className="py-2 pr-3">Normalized rank</th>
                          <th className="py-2 pr-3">Movement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.normalizedScores.map((row) => {
                          const movement = row.rawRank !== null ? row.rawRank - row.rank : null;
                          return (
                            <tr key={row.id} className="border-b border-line last:border-0">
                              <td className="py-2 pr-3 text-ink">{row.submission.title || 'Untitled submission'}</td>
                              <td className="py-2 pr-3 font-mono text-ink-muted">
                                {row.averageRawTotal !== null ? row.averageRawTotal.toFixed(1) : '—'}
                              </td>
                              <td className="py-2 pr-3 font-mono text-ink-muted">{row.rawRank ?? '—'}</td>
                              <td className="py-2 pr-3 font-mono text-ink-muted">{row.finalScore.toFixed(1)}</td>
                              <td className="py-2 pr-3 font-mono text-ink-muted">{row.rank}</td>
                              <td className="py-2 pr-3">
                                {movement === null ? (
                                  '—'
                                ) : movement === 0 ? (
                                  <span className="text-ink-faint">No change</span>
                                ) : movement > 0 ? (
                                  <span className="text-success">↑ {movement}</span>
                                ) : (
                                  <span className="text-danger">↓ {Math.abs(movement)}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="mb-3 font-display text-lg text-ink">Judge calibration</h2>
                {detail.judgeScores.length === 0 ? (
                  <p className="text-sm text-ink-muted">No judge scores in this run.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {dedupeByJudge(detail.judgeScores).map((js) => {
                      const live = calibration[js.judgeAssignment.judgeId];
                      return (
                        <li key={js.judgeAssignment.judgeId} className="rounded border border-line p-3">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-ink">{js.judgeAssignment.judge.displayName}</p>
                            {js.uniformScoringFlagged && <Badge tone="danger">Uniform scoring</Badge>}
                          </div>
                          {js.usedFallback ? (
                            <p className="mt-1 text-xs text-warning">
                              Using event baseline — not enough scoring history yet.
                            </p>
                          ) : (
                            <p className="mt-1 font-mono text-xs text-ink-muted">
                              At run: mean {js.judgeMeanAtRun.toFixed(1)} · stddev {js.judgeStdDevAtRun.toFixed(1)} · n=
                              {js.sampleCountAtRun}
                            </p>
                          )}
                          {live && (
                            <p className="mt-1 font-mono text-xs text-ink-faint">
                              Live: mean {live.judgeCalibrationMean.toFixed(1)} · stddev{' '}
                              {live.judgeCalibrationStdDev.toFixed(1)} · n={live.judgeCalibrationSampleCount}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
