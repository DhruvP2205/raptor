'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { VotingResultsList } from '@/components/voting/VotingResultsList';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  ApiError,
  correctShortlistEntry,
  createInitialVotingRound,
  createVotingCorrection,
  finalizeShortlist,
  getCurrentVotingRound,
  getEvent,
  getLiveTally,
  getShortlistEntries,
  getShortlistSuggestions,
  listAbuseFlags,
  listNormalizationRuns,
  listVotingResultVersions,
  listVotingRounds,
  publishVotingResults,
  restartVotingRound,
  reviewAbuseFlag,
  setVotingEligibilityMode,
  unpublishVotingResults,
  getVotingResultVersionDetail,
} from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type {
  NormalizationRunSummary,
  PublicEvent,
  ShortlistEntryRow,
  ShortlistSuggestion,
  VoteAbuseFlag,
  VotingCorrectionType,
  VotingEligibilityMode,
  VotingResultVersion,
  VotingResultVersionSummary,
  VotingRound,
  VotingTallyEntry,
} from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}
function toDatetimeLocal(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

const ROUND_STATUS_TONE: Record<VotingRound['status'], Tone> = {
  ACTIVE: 'live',
  SUPERSEDED: 'neutral',
  DEACTIVATED: 'neutral',
};

export default function OrganizerVotingPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const { showToast } = useToast();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Eligibility mode
  const [modeChoice, setModeChoice] = useState<VotingEligibilityMode>('VERIFIED_PLATFORM_USERS');
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<unknown>(null);

  // Round
  const [round, setRound] = useState<VotingRound | null | undefined>(undefined);
  const [roundBusy, setRoundBusy] = useState(false);
  const [roundError, setRoundError] = useState<unknown>(null);

  // Shortlist
  const [shortlist, setShortlist] = useState<ShortlistEntryRow[] | null>(null);
  const [runs, setRuns] = useState<NormalizationRunSummary[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [suggestions, setSuggestions] = useState<ShortlistSuggestion[] | null>(null);
  const [suggestCount, setSuggestCount] = useState(6);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Suggestions come from a NormalizationRun and are advisory-only —
  // finalizeShortlist itself accepts any submissionId belonging to the
  // event, not just suggested ones (and works fine with zero runs, per
  // its own safe-suggestions fallback). Without this, an organizer with
  // no normalization run yet (or a submission approved after the run)
  // would have no way to shortlist it at all.
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [manualIdInput, setManualIdInput] = useState('');
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<unknown>(null);
  const [correctionEntry, setCorrectionEntry] = useState<ShortlistEntryRow | null>(null);
  const [correctionSubmissionId, setCorrectionSubmissionId] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState<unknown>(null);

  // Tally
  const [tally, setTally] = useState<VotingTallyEntry[] | null>(null);

  // Restart
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartOpensAt, setRestartOpensAt] = useState('');
  const [restartClosesAt, setRestartClosesAt] = useState('');
  const [restartAnnounceAt, setRestartAnnounceAt] = useState('');
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<unknown>(null);

  // Round history
  const [rounds, setRounds] = useState<VotingRound[] | null>(null);
  const [historyRoundId, setHistoryRoundId] = useState<string | null>(null);
  const [historyTally, setHistoryTally] = useState<VotingTallyEntry[] | null>(null);
  const [historyShortlist, setHistoryShortlist] = useState<ShortlistEntryRow[] | null>(null);

  // Abuse flags
  const [abuseFlags, setAbuseFlags] = useState<VoteAbuseFlag[] | null>(null);
  const [banTarget, setBanTarget] = useState<VoteAbuseFlag | null>(null);
  const [banSelected, setBanSelected] = useState<Set<string>>(new Set());
  const [abuseBusy, setAbuseBusy] = useState(false);
  const [abuseError, setAbuseError] = useState<unknown>(null);

  // Results
  const [versions, setVersions] = useState<VotingResultVersionSummary[] | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDetail, setVersionDetail] = useState<VotingResultVersion | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<unknown>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishBusy, setUnpublishBusy] = useState(false);
  const [resultCorrection, setResultCorrection] = useState<{ type: VotingCorrectionType; submissionId: string; title: string | null } | null>(
    null,
  );
  const [resultCorrectionTarget, setResultCorrectionTarget] = useState('');
  const [resultCorrectionBusy, setResultCorrectionBusy] = useState(false);
  const [resultCorrectionError, setResultCorrectionError] = useState<unknown>(null);

  const loadRound = useCallback(async (eventId: string) => {
    try {
      const r = await getCurrentVotingRound(eventId);
      setRound(r);
      return r;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_ACTIVE_ROUND') {
        setRound(null);
        return null;
      }
      throw err;
    }
  }, []);

  const loadShortlist = useCallback(async (eventId: string, roundId: string) => {
    const entries = await getShortlistEntries(eventId, roundId);
    setShortlist(entries);
    return entries;
  }, []);

  const loadTally = useCallback(async (eventId: string, roundId: string) => {
    const t = await getLiveTally(eventId, roundId);
    setTally(t);
    return t;
  }, []);

  const loadRounds = useCallback((eventId: string) => listVotingRounds(eventId).then(setRounds), []);
  const loadAbuseFlags = useCallback((eventId: string) => listAbuseFlags(eventId).then(setAbuseFlags), []);
  const loadVersions = useCallback((eventId: string) => listVotingResultVersions(eventId).then(setVersions), []);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        if (e.votingEligibilityMode) setModeChoice(e.votingEligibilityMode);
        const [runList, versionList] = await Promise.all([listNormalizationRuns(e.id), loadVersions(e.id)]);
        setRuns(runList);
        if (runList.length > 0) setSelectedRunId(runList[0].id);
        void versionList;
        await loadRounds(e.id);
        await loadAbuseFlags(e.id);
        const r = await loadRound(e.id);
        if (r) {
          const entries = await loadShortlist(e.id, r.id);
          if (entries.length > 0) await loadTally(e.id, r.id);
        }
      })
      .catch(setError);
  }, [ready, slug, loadRound, loadShortlist, loadTally, loadRounds, loadAbuseFlags, loadVersions]);

  useEffect(() => {
    if (!event || !selectedVersionId) {
      setVersionDetail(null);
      return;
    }
    getVotingResultVersionDetail(event.id, selectedVersionId).then(setVersionDetail).catch(() => setVersionDetail(null));
  }, [event, selectedVersionId]);

  useEffect(() => {
    if (versions && versions.length > 0 && !selectedVersionId) setSelectedVersionId(versions[0].id);
  }, [versions, selectedVersionId]);

  useEffect(() => {
    if (!event || !historyRoundId) {
      setHistoryTally(null);
      setHistoryShortlist(null);
      return;
    }
    Promise.all([getLiveTally(event.id, historyRoundId), getShortlistEntries(event.id, historyRoundId)]).then(
      ([t, sl]) => {
        setHistoryTally(t);
        setHistoryShortlist(sl);
      },
    );
  }, [event, historyRoundId]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || round === undefined || !rounds || !abuseFlags || !versions) return <PageSpinner />;

  const now = Date.now();
  const restartWindowOpen =
    now >= new Date(event.resultsAnnounceAt).getTime() && now <= new Date(event.eventClosedAt).getTime();

  async function handleSetMode() {
    setModeBusy(true);
    setModeError(null);
    try {
      const updated = await setVotingEligibilityMode(event!.id, modeChoice);
      setEvent((e) => (e ? { ...e, votingEligibilityMode: updated.votingEligibilityMode } : e));
    } catch (err) {
      setModeError(err);
    } finally {
      setModeBusy(false);
    }
  }

  async function handleCreateRound() {
    setRoundBusy(true);
    setRoundError(null);
    try {
      const r = await createInitialVotingRound(event!.id);
      setRound(r);
      await loadRounds(event!.id);
      await loadShortlist(event!.id, r.id);
    } catch (err) {
      setRoundError(err);
    } finally {
      setRoundBusy(false);
    }
  }

  async function loadSuggestions(runId: string) {
    try {
      const list = await getShortlistSuggestions(event!.id, runId || undefined);
      setSuggestions(list);
      setChecked(new Set(list.slice(0, suggestCount).map((s) => s.submissionId)));
    } catch (err) {
      setSuggestions([]);
    }
  }

  function toggleChecked(submissionId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }

  async function handleFinalize() {
    if (!round) return;
    setFinalizeBusy(true);
    setFinalizeError(null);
    try {
      await finalizeShortlist(event!.id, round.id, [...checked]);
      await loadShortlist(event!.id, round.id);
      showToast('Shortlist finalized.');
    } catch (err) {
      setFinalizeError(err);
    } finally {
      setFinalizeBusy(false);
    }
  }

  async function submitShortlistCorrection(reason?: string) {
    if (!correctionEntry || !round) return;
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      await correctShortlistEntry(event!.id, round.id, correctionEntry.id, {
        newSubmissionId: correctionSubmissionId,
        reason: reason ?? '',
      });
      await loadShortlist(event!.id, round.id);
      setCorrectionEntry(null);
      showToast('Shortlist entry corrected.');
    } catch (err) {
      setCorrectionError(err);
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function submitRestart(reason?: string) {
    setRestartBusy(true);
    setRestartError(null);
    try {
      const newRound = await restartVotingRound(event!.id, {
        reason: reason ?? '',
        votingOpensAt: new Date(restartOpensAt).toISOString(),
        votingClosesAt: new Date(restartClosesAt).toISOString(),
        votingWinnerAnnounceAt: new Date(restartAnnounceAt).toISOString(),
      });
      setRound(newRound);
      setShortlist([]);
      setTally(null);
      await loadRounds(event!.id);
      setRestartOpen(false);
      showToast(`Round ${newRound.roundNumber} started.`);
    } catch (err) {
      setRestartError(err);
    } finally {
      setRestartBusy(false);
    }
  }

  async function handleAbuseClear(flag: VoteAbuseFlag) {
    setAbuseBusy(true);
    setAbuseError(null);
    try {
      await reviewAbuseFlag(event!.id, flag.id, { action: 'CLEAR' });
      await loadAbuseFlags(event!.id);
    } catch (err) {
      setAbuseError(err);
    } finally {
      setAbuseBusy(false);
    }
  }

  async function submitBan(reason?: string) {
    if (!banTarget) return;
    setAbuseBusy(true);
    setAbuseError(null);
    try {
      await reviewAbuseFlag(event!.id, banTarget.id, {
        action: 'BAN',
        banReason: reason ?? '',
        banUserIds: [...banSelected],
      });
      await loadAbuseFlags(event!.id);
      setBanTarget(null);
    } catch (err) {
      setAbuseError(err);
    } finally {
      setAbuseBusy(false);
    }
  }

  async function handlePublish() {
    setPublishBusy(true);
    setPublishError(null);
    try {
      const version = await publishVotingResults(event!.id);
      await loadVersions(event!.id);
      setSelectedVersionId(version.id);
      showToast('Voting results published.');
    } catch (err) {
      setPublishError(err);
    } finally {
      setPublishBusy(false);
    }
  }

  async function submitUnpublish(reason?: string) {
    if (!versionDetail) return;
    setUnpublishBusy(true);
    try {
      await unpublishVotingResults(event!.id, versionDetail.id, reason ?? '');
      await loadVersions(event!.id);
      setUnpublishOpen(false);
      showToast('Voting results unpublished.');
    } catch (err) {
      setPublishError(err);
    } finally {
      setUnpublishBusy(false);
    }
  }

  async function submitResultCorrection(reason?: string) {
    if (!resultCorrection || !versionDetail) return;
    setResultCorrectionBusy(true);
    setResultCorrectionError(null);
    try {
      const input: Parameters<typeof createVotingCorrection>[2] = {
        type: resultCorrection.type,
        submissionId: resultCorrection.submissionId,
        reason: reason ?? '',
      };
      if (resultCorrection.type === 'REASSIGN_CREDIT') input.newSubmissionId = resultCorrectionTarget;
      const updated = await createVotingCorrection(event!.id, versionDetail.id, input);
      await loadVersions(event!.id);
      setSelectedVersionId(updated.id);
      setResultCorrection(null);
      showToast('Correction published as a new version.');
    } catch (err) {
      setResultCorrectionError(err);
    } finally {
      setResultCorrectionBusy(false);
    }
  }

  const shortlistFinalized = shortlist !== null && shortlist.length > 0;

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — voting</h1>
      <p className="mb-6 text-sm text-ink-muted">Audience-choice shortlist, rounds, and results.</p>

      <div className="flex flex-col gap-6">
        {/* --- Eligibility mode --- */}
        <Card>
          <h2 className="font-display text-lg text-ink">Eligibility</h2>
          {round ? (
            <p className="mt-2 text-sm text-ink-muted">
              {event.votingEligibilityMode === 'PARTICIPANTS_ONLY' ? 'Participants only' : 'Any verified platform user'}{' '}
              — locked once round 1 exists.
            </p>
          ) : (
            <>
              <fieldset className="mt-3">
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="eligibility-mode"
                      checked={modeChoice === 'VERIFIED_PLATFORM_USERS'}
                      onChange={() => setModeChoice('VERIFIED_PLATFORM_USERS')}
                    />
                    Any user with a verified email
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="eligibility-mode"
                      checked={modeChoice === 'PARTICIPANTS_ONLY'}
                      onChange={() => setModeChoice('PARTICIPANTS_ONLY')}
                    />
                    Participants of this event only
                  </label>
                </div>
              </fieldset>
              <ApiErrorAlert error={modeError} />
              <Button size="sm" className="mt-3" loading={modeBusy} onClick={handleSetMode}>
                Save eligibility mode
              </Button>
            </>
          )}
        </Card>

        {/* --- Round / shortlist --- */}
        <Card>
          <h2 className="font-display text-lg text-ink">Voting round</h2>
          {!round ? (
            <div className="mt-3">
              <ApiErrorAlert error={roundError} />
              {!event.votingEligibilityMode ? (
                <p className="text-xs text-ink-muted">Set an eligibility mode above before starting round 1.</p>
              ) : (
                <Button size="sm" loading={roundBusy} onClick={handleCreateRound}>
                  Start voting round 1
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                <Badge tone={ROUND_STATUS_TONE[round.status]}>Round {round.roundNumber}</Badge>
                <span className="font-mono text-xs">
                  {formatTimestamp(round.votingOpensAt)} → {formatTimestamp(round.votingClosesAt)}
                </span>
              </div>

              {!shortlistFinalized ? (
                <div className="mt-4">
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <div>
                      <label htmlFor="suggest-run" className="text-xs font-medium text-ink">
                        Normalization run
                      </label>
                      <select
                        id="suggest-run"
                        value={selectedRunId}
                        onChange={(e) => {
                          setSelectedRunId(e.target.value);
                          loadSuggestions(e.target.value);
                        }}
                        className="mt-1 block rounded border border-line bg-white px-2 py-1.5 text-sm text-ink"
                      >
                        {(runs ?? []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {formatTimestamp(r.runAt)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {/* design doc says "an organizer-set range input
                          (e.g. top 4-8)" — implemented as a single target
                          count that pre-checks the top N suggestions,
                          the smallest interpretation that still lets the
                          organizer freely add/remove any row afterward.
                          TODO: undocumented decision, needs confirmation. */}
                      <label htmlFor="suggest-count" className="text-xs font-medium text-ink">
                        Suggest top (4–8 recommended)
                      </label>
                      <Input
                        id="suggest-count"
                        type="number"
                        min={1}
                        value={suggestCount}
                        onChange={(e) => setSuggestCount(Number(e.target.value))}
                        className="mt-1 w-20"
                      />
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => loadSuggestions(selectedRunId)}>
                      Load suggestions
                    </Button>
                  </div>

                  {suggestions === null ? (
                    <p className="text-xs text-ink-muted">Load suggestions to begin building the shortlist.</p>
                  ) : suggestions.length === 0 ? (
                    <p className="text-xs text-ink-muted">No normalization-ranked suggestions yet — add submissions manually below.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {suggestions.map((s) => (
                        <li key={s.submissionId} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={checked.has(s.submissionId)} onChange={() => toggleChecked(s.submissionId)} />
                            {s.title || 'Untitled submission'}
                          </label>
                          <span className="font-mono text-xs text-ink-faint">
                            #{s.rank} · {s.finalScore.toFixed(1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {manualIds.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {manualIds.map((id) => (
                        <li key={id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm">
                          <span className="font-mono text-xs">{id}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setManualIds((list) => list.filter((x) => x !== id));
                              setChecked((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                              });
                            }}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1">
                      <label htmlFor="manual-submission-id" className="text-xs font-medium text-ink">
                        Add submission by ID (for anything not suggested above)
                      </label>
                      <Input
                        id="manual-submission-id"
                        value={manualIdInput}
                        onChange={(e) => setManualIdInput(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!manualIdInput.trim()}
                      onClick={() => {
                        const id = manualIdInput.trim();
                        setManualIds((list) => (list.includes(id) ? list : [...list, id]));
                        setChecked((prev) => new Set(prev).add(id));
                        setManualIdInput('');
                      }}
                    >
                      Add
                    </Button>
                  </div>

                  <ApiErrorAlert error={finalizeError} />
                  <Button size="sm" className="mt-3" loading={finalizeBusy} disabled={checked.size === 0} onClick={handleFinalize}>
                    Finalize shortlist
                  </Button>
                </div>
              ) : (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-medium text-ink">Shortlist</h3>
                  <ul className="flex flex-col gap-1">
                    {(shortlist ?? []).map((entry) => {
                      const t = tally?.find((x) => x.submissionId === entry.submissionId);
                      return (
                        <li key={entry.id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm">
                          <span>{entry.submission?.title || 'Untitled submission'}</span>
                          <div className="flex items-center gap-3">
                            {t && (
                              <span className="font-mono text-xs text-ink-muted">
                                {t.voteCount} votes ({t.votePercentage.toFixed(1)}%)
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCorrectionEntry(entry);
                                setCorrectionSubmissionId('');
                                setCorrectionError(null);
                              }}
                            >
                              Correct
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-4 border-t border-line pt-4">
                {restartWindowOpen ? (
                  <Button size="sm" variant="danger" onClick={() => setRestartOpen(true)}>
                    Restart round
                  </Button>
                ) : (
                  <p className="text-xs text-ink-muted">
                    A full round restart is only available between results announcement and event close.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>

        {/* --- Round history --- */}
        <Card>
          <h2 className="font-display text-lg text-ink">Round history</h2>
          {rounds.length === 0 ? (
            <EmptyState title="No rounds yet." />
          ) : (
            <div className="mt-3 grid gap-4 lg:grid-cols-[220px_1fr]">
              <ul className="flex flex-col gap-1">
                {rounds.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setHistoryRoundId(r.id)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                        r.id === historyRoundId ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
                      }`}
                    >
                      <span>Round {r.roundNumber}</span>
                      <Badge tone={ROUND_STATUS_TONE[r.status]}>{r.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
              {historyRoundId && historyTally && historyShortlist && (
                <div>
                  {historyShortlist.length === 0 ? (
                    <p className="text-sm text-ink-muted">This round&apos;s shortlist was never finalized.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {historyShortlist.map((entry) => {
                        const t = historyTally.find((x) => x.submissionId === entry.submissionId);
                        return (
                          <li key={entry.id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm">
                            <span>{entry.submission?.title || 'Untitled submission'}</span>
                            <span className="font-mono text-xs text-ink-muted">
                              {t ? `${t.voteCount} votes (${t.votePercentage.toFixed(1)}%)` : '—'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* --- Abuse review --- */}
        <Card>
          <h2 className="font-display text-lg text-ink">Abuse flags</h2>
          <ApiErrorAlert error={abuseError} />
          {abuseFlags.length === 0 ? (
            <EmptyState title="No flagged votes." />
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {abuseFlags.map((flag) => (
                <li key={flag.id} className="rounded border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-muted">
                      {flag.implicatedUserIds.length} accounts · shared network · {formatTimestamp(flag.createdAt)}
                    </span>
                    <Badge tone={flag.status === 'PENDING' ? 'live' : flag.status === 'REVIEWED_BANNED' ? 'danger' : 'neutral'}>
                      {flag.status}
                    </Badge>
                  </div>
                  {flag.status === 'PENDING' && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" loading={abuseBusy} onClick={() => handleAbuseClear(flag)}>
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setBanTarget(flag);
                          setBanSelected(new Set(flag.implicatedUserIds));
                        }}
                      >
                        Ban
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --- Results publish/correct --- */}
        <Card>
          <h2 className="mb-3 font-display text-lg text-ink">Voting results</h2>
          {round && shortlistFinalized && (
            <div className="mb-4">
              <ApiErrorAlert error={publishError} />
              <Button size="sm" loading={publishBusy} onClick={handlePublish}>
                Publish current tally
              </Button>
            </div>
          )}
          {versions.length === 0 ? (
            <EmptyState title="Nothing published yet." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <ul className="flex flex-col gap-1">
                {versions.map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => setSelectedVersionId(v.id)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                        v.id === selectedVersionId ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
                      }`}
                    >
                      <span>v{v.versionNumber}</span>
                      <Badge tone={v.status === 'LIVE' ? 'success' : v.status === 'UNPUBLISHED' ? 'danger' : 'neutral'}>{v.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
              {versionDetail && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-ink-faint">
                      Published {formatTimestamp(versionDetail.publishedAt)}
                      {versionDetail.correctionReason && ` — correction: ${versionDetail.correctionReason}`}
                      {versionDetail.unpublishReason && ` — unpublished: ${versionDetail.unpublishReason}`}
                    </p>
                    {versionDetail.status === 'LIVE' && (
                      <Button size="sm" variant="danger" onClick={() => setUnpublishOpen(true)}>
                        Unpublish
                      </Button>
                    )}
                  </div>
                  <VotingResultsList
                    entries={versionDetail.entries}
                    correctedSubmissionId={versionDetail.correctedSubmissionId}
                    correctionReason={versionDetail.correctionReason}
                    renderActions={
                      versionDetail.status === 'LIVE'
                        ? (entry) =>
                            entry.isDisqualified ? null : (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setResultCorrection({ type: 'REASSIGN_CREDIT', submissionId: entry.submissionId, title: entry.submission?.title ?? null });
                                    setResultCorrectionTarget('');
                                    setResultCorrectionError(null);
                                  }}
                                >
                                  Reassign credit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setResultCorrection({ type: 'DISQUALIFY', submissionId: entry.submissionId, title: entry.submission?.title ?? null });
                                    setResultCorrectionError(null);
                                  }}
                                >
                                  Disqualify
                                </Button>
                              </div>
                            )
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* --- Modals --- */}

      <ConfirmDialog
        open={correctionEntry !== null}
        title="Correct this shortlist entry?"
        description={`${correctionEntry?.submission?.title || 'This entry'} — cosmetic swap only, has zero effect on votes already cast. Requires a reason.`}
        confirmLabel="Confirm correction"
        requireReason
        extraValid={correctionSubmissionId.trim() !== ''}
        loading={correctionBusy}
        onConfirm={submitShortlistCorrection}
        onCancel={() => setCorrectionEntry(null)}
      >
        <div className="mt-3">
          <label htmlFor="correction-submission-id" className="text-sm font-medium text-ink">
            Replacement submission ID
          </label>
          <Input
            id="correction-submission-id"
            value={correctionSubmissionId}
            onChange={(e) => setCorrectionSubmissionId(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <ApiErrorAlert error={correctionError} />
      </ConfirmDialog>

      <ConfirmDialog
        open={restartOpen}
        title="Restart the voting round?"
        description="This deactivates the current round. All its votes are excluded from results. A new round starts from a blank shortlist. This can't be undone."
        confirmLabel="Restart round"
        requireReason
        extraValid={
          !!restartOpensAt &&
          !!restartClosesAt &&
          !!restartAnnounceAt &&
          new Date(restartOpensAt).getTime() < new Date(restartClosesAt).getTime() &&
          new Date(restartClosesAt).getTime() < new Date(restartAnnounceAt).getTime()
        }
        loading={restartBusy}
        onConfirm={submitRestart}
        onCancel={() => setRestartOpen(false)}
      >
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-sm font-medium text-ink">
            Voting opens
            <input
              type="datetime-local"
              value={restartOpensAt}
              onChange={(e) => setRestartOpensAt(e.target.value)}
              className="mt-1 block w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Voting closes
            <input
              type="datetime-local"
              value={restartClosesAt}
              onChange={(e) => setRestartClosesAt(e.target.value)}
              className="mt-1 block w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Winner announced
            <input
              type="datetime-local"
              value={restartAnnounceAt}
              onChange={(e) => setRestartAnnounceAt(e.target.value)}
              className="mt-1 block w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>
        <ApiErrorAlert error={restartError} />
      </ConfirmDialog>

      <ConfirmDialog
        open={banTarget !== null}
        title="Ban implicated accounts?"
        description="Banned accounts are blocked from re-registering with the same email. Requires a reason."
        confirmLabel="Ban selected"
        requireReason
        extraValid={banSelected.size > 0}
        loading={abuseBusy}
        onConfirm={submitBan}
        onCancel={() => setBanTarget(null)}
      >
        <div className="mt-3 flex flex-col gap-1.5">
          {banTarget?.implicatedUserIds.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={banSelected.has(id)}
                onChange={() =>
                  setBanSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
              <span className="font-mono text-xs">{id}</span>
            </label>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={unpublishOpen}
        title="Unpublish these voting results?"
        description="The public ballot page will stop showing results and hide the tally again."
        confirmLabel="Unpublish"
        requireReason
        loading={unpublishBusy}
        onConfirm={submitUnpublish}
        onCancel={() => setUnpublishOpen(false)}
      />

      <ConfirmDialog
        open={resultCorrection !== null}
        title={resultCorrection?.type === 'DISQUALIFY' ? 'Disqualify this submission?' : 'Reassign credit to another submission?'}
        description={`${resultCorrection?.title || 'This submission'} — creates a new published version, visibly marked as a correction. Requires a reason.`}
        confirmLabel="Confirm correction"
        requireReason
        extraValid={resultCorrection?.type !== 'REASSIGN_CREDIT' || resultCorrectionTarget.trim() !== ''}
        loading={resultCorrectionBusy}
        onConfirm={submitResultCorrection}
        onCancel={() => setResultCorrection(null)}
      >
        {resultCorrection?.type === 'REASSIGN_CREDIT' && (
          <div className="mt-3">
            <label htmlFor="reassign-target" className="text-sm font-medium text-ink">
              New submission ID
            </label>
            <Input id="reassign-target" value={resultCorrectionTarget} onChange={(e) => setResultCorrectionTarget(e.target.value)} className="mt-1.5" />
          </div>
        )}
        <ApiErrorAlert error={resultCorrectionError} />
      </ConfirmDialog>
    </Container>
  );
}
