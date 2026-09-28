'use client';

import { RankResultsList, SpecialAwardsList } from '@/components/results/ResultsLists';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  createResultCorrection,
  createResultsDraft,
  getEvent,
  getResultVersionDetail,
  listNormalizationRuns,
  listResultVersions,
  listResultsDrafts,
  previewResultsDraft,
  publishResultsDraft,
  unpublishResultVersion,
  updateResultsDraft,
} from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type {
  NormalizationRunSummary,
  PublicEvent,
  PublishedResultVersion,
  PublishedResultVersionSummary,
  PublishMode,
  RankResultRow,
  ResultCorrectionType,
  ResultsDraft,
  ResultsPreview,
} from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

const VERSION_STATUS_TONE: Record<PublishedResultVersionSummary['status'], Tone> = {
  LIVE: 'success',
  SUPERSEDED: 'neutral',
  UNPUBLISHED: 'danger',
};

export default function OrganizerResultsPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const { showToast } = useToast();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);

  // --- Draft section ---
  const [runs, setRuns] = useState<NormalizationRunSummary[] | null>(null);
  const [drafts, setDrafts] = useState<ResultsDraft[] | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ResultsPreview | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [newDraftRunId, setNewDraftRunId] = useState('');
  const [newDraftMode, setNewDraftMode] = useState<PublishMode>('MANUAL');
  const [draftActionError, setDraftActionError] = useState<unknown>(null);
  const [draftBusy, setDraftBusy] = useState(false);

  // --- Published versions section ---
  const [versions, setVersions] = useState<PublishedResultVersionSummary[] | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDetail, setVersionDetail] = useState<PublishedResultVersion | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishBusy, setUnpublishBusy] = useState(false);
  const [correction, setCorrection] = useState<{ type: ResultCorrectionType; row: RankResultRow } | null>(null);
  const [correctionExtra, setCorrectionExtra] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState<unknown>(null);

  const loadDrafts = useCallback((eventId: string) => {
    return listResultsDrafts(eventId).then((list) => {
      setDrafts(list);
      return list;
    });
  }, []);
  const loadVersions = useCallback((eventId: string) => {
    return listResultVersions(eventId).then((list) => {
      setVersions(list);
      return list;
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        const [runList, draftList, versionList] = await Promise.all([
          listNormalizationRuns(e.id),
          loadDrafts(e.id),
          loadVersions(e.id),
        ]);
        setRuns(runList);
        if (runList.length > 0) setNewDraftRunId(runList[0].id);
        if (draftList.length > 0) setSelectedDraftId(draftList[0].id);
        if (versionList.length > 0) setSelectedVersionId(versionList[0].id);
      })
      .catch(setError);
  }, [ready, slug, loadDrafts, loadVersions]);

  useEffect(() => {
    if (!event || !selectedDraftId) {
      setPreview(null);
      return;
    }
    previewResultsDraft(event.id, selectedDraftId).then(setPreview).catch(() => setPreview(null));
  }, [event, selectedDraftId]);

  useEffect(() => {
    if (!event || !selectedVersionId) {
      setVersionDetail(null);
      return;
    }
    getResultVersionDetail(event.id, selectedVersionId).then(setVersionDetail).catch(() => setVersionDetail(null));
  }, [event, selectedVersionId]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || !runs || !drafts || !versions) return <PageSpinner />;

  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null;
  const now = Date.now();
  const announceAt = new Date(event.resultsAnnounceAt).getTime();
  const announcePassed = now >= announceAt;

  async function handleCreateDraft() {
    setDraftBusy(true);
    setDraftActionError(null);
    try {
      const created = await createResultsDraft(event!.id, {
        normalizationRunId: newDraftRunId || undefined,
        publishMode: newDraftMode,
      });
      await loadDrafts(event!.id);
      setSelectedDraftId(created.id);
      setCreatingDraft(false);
    } catch (err) {
      setDraftActionError(err);
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleToggleReady() {
    if (!selectedDraft) return;
    setDraftBusy(true);
    setDraftActionError(null);
    try {
      const updated = await updateResultsDraft(event!.id, selectedDraft.id, {
        draftStatus: selectedDraft.draftStatus === 'READY' ? 'IN_PROGRESS' : 'READY',
      });
      setDrafts((list) => (list ? list.map((d) => (d.id === updated.id ? updated : d)) : list));
    } catch (err) {
      setDraftActionError(err);
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleSetPublishMode(mode: PublishMode) {
    if (!selectedDraft) return;
    setDraftBusy(true);
    setDraftActionError(null);
    try {
      const updated = await updateResultsDraft(event!.id, selectedDraft.id, { publishMode: mode });
      setDrafts((list) => (list ? list.map((d) => (d.id === updated.id ? updated : d)) : list));
    } catch (err) {
      setDraftActionError(err);
    } finally {
      setDraftBusy(false);
    }
  }

  async function handlePublishNow() {
    if (!selectedDraft) return;
    setDraftBusy(true);
    setDraftActionError(null);
    try {
      const version = await publishResultsDraft(event!.id, selectedDraft.id);
      await loadVersions(event!.id);
      setSelectedVersionId(version.id);
      showToast('Results published.');
    } catch (err) {
      setDraftActionError(err);
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleUnpublish(reason?: string) {
    if (!versionDetail) return;
    setUnpublishBusy(true);
    try {
      await unpublishResultVersion(event!.id, versionDetail.id, reason ?? '');
      await loadVersions(event!.id);
      setUnpublishOpen(false);
      showToast('Results unpublished.');
    } catch (err) {
      setDraftActionError(err);
    } finally {
      setUnpublishBusy(false);
    }
  }

  function openCorrection(type: ResultCorrectionType, row: RankResultRow) {
    setCorrection({ type, row });
    setCorrectionExtra(type === 'REORDER' ? String(row.rank) : type === 'SCORE_OVERRIDE' ? String(row.displayScore) : '');
    setCorrectionError(null);
  }

  function correctionExtraValid(): boolean {
    if (!correction) return false;
    if (correction.type === 'DISQUALIFY') return true;
    if (correction.type === 'REORDER') return Number.isInteger(Number(correctionExtra)) && Number(correctionExtra) >= 1;
    return correctionExtra.trim() !== '' && Number.isFinite(Number(correctionExtra));
  }

  async function submitCorrection(reason?: string) {
    if (!correction || !versionDetail) return;
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      const input: Parameters<typeof createResultCorrection>[2] = {
        type: correction.type,
        submissionId: correction.row.submissionId,
        reason: reason ?? '',
      };
      if (correction.type === 'REORDER') input.newRank = Number(correctionExtra);
      if (correction.type === 'SCORE_OVERRIDE') input.displayScore = Number(correctionExtra);
      const updated = await createResultCorrection(event!.id, versionDetail.id, input);
      await loadVersions(event!.id);
      setSelectedVersionId(updated.id);
      setCorrection(null);
      showToast('Correction published as a new version.');
    } catch (err) {
      setCorrectionError(err);
    } finally {
      setCorrectionBusy(false);
    }
  }

  return (
    <Container className="py-10">
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — results</h1>
      <p className="mb-6 text-sm text-ink-muted">Draft, publish, and correct the official results.</p>

      <div className="flex flex-col gap-6">
        {/* --- Draft results (design doc Section 3) --- */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Draft results</h2>
            {!creatingDraft && (
              <Button size="sm" variant="secondary" onClick={() => setCreatingDraft(true)} disabled={runs.length === 0}>
                New draft
              </Button>
            )}
          </div>
          {runs.length === 0 && <p className="mt-2 text-xs text-ink-muted">Run normalization at least once first.</p>}

          {creatingDraft && (
            <div className="mt-4 rounded border border-line p-3">
              <label htmlFor="draft-run" className="text-sm font-medium text-ink">
                Normalization run
              </label>
              <select
                id="draft-run"
                value={newDraftRunId}
                onChange={(e) => setNewDraftRunId(e.target.value)}
                className="mt-1.5 w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatTimestamp(r.runAt)}
                  </option>
                ))}
              </select>
              <fieldset className="mt-3">
                <legend className="text-sm font-medium text-ink">Publish mode</legend>
                <div className="mt-2 flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="new-draft-mode" checked={newDraftMode === 'MANUAL'} onChange={() => setNewDraftMode('MANUAL')} />
                    Manual — publish only when I click Publish
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="new-draft-mode" checked={newDraftMode === 'AUTO'} onChange={() => setNewDraftMode('AUTO')} />
                    Auto — publish automatically once marked Ready
                  </label>
                </div>
              </fieldset>
              <div className="mt-3 flex gap-2">
                <Button size="sm" loading={draftBusy} onClick={handleCreateDraft}>
                  Create draft
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreatingDraft(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {drafts.length === 0 && !creatingDraft ? (
            <div className="mt-4">
              <EmptyState title="No draft yet." />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
              <ul className="flex flex-col gap-1">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => setSelectedDraftId(d.id)}
                      className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                        d.id === selectedDraftId ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-paper-raised hover:text-ink'
                      }`}
                    >
                      <span className="font-mono">{formatTimestamp(d.createdAt)}</span>
                      <span className="ml-1.5">({d.draftStatus === 'READY' ? 'Ready' : 'In progress'})</span>
                    </button>
                  </li>
                ))}
              </ul>

              {selectedDraft && (
                <div>
                  <ApiErrorAlert error={draftActionError} />

                  {selectedDraft.draftStatus === 'IN_PROGRESS' && announcePassed && (
                    <div className="mb-3">
                      <Alert tone="warning">
                        The scheduled announcement time has passed, but this draft isn&apos;t marked Ready yet. Publish
                        manually when ready.
                      </Alert>
                    </div>
                  )}
                  {selectedDraft.draftStatus === 'READY' && selectedDraft.publishMode === 'AUTO' && (
                    <div className="mb-3">
                      <Alert tone="neutral">
                        This will publish automatically at {formatTimestamp(event.resultsAnnounceAt)}.
                      </Alert>
                    </div>
                  )}

                  <div className="mb-4 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={selectedDraft.draftStatus === 'READY'}
                        onChange={handleToggleReady}
                        disabled={draftBusy}
                      />
                      Ready
                    </label>
                    <fieldset className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="publish-mode"
                          checked={selectedDraft.publishMode === 'MANUAL'}
                          onChange={() => handleSetPublishMode('MANUAL')}
                          disabled={draftBusy}
                        />
                        Manual
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="publish-mode"
                          checked={selectedDraft.publishMode === 'AUTO'}
                          onChange={() => handleSetPublishMode('AUTO')}
                          disabled={draftBusy}
                        />
                        Auto
                      </label>
                    </fieldset>
                    {selectedDraft.draftStatus === 'READY' && selectedDraft.publishMode === 'MANUAL' && (
                      <Button size="sm" loading={draftBusy} onClick={handlePublishNow}>
                        Publish now
                      </Button>
                    )}
                  </div>

                  <h3 className="mb-2 text-sm font-medium text-ink">Preview</h3>
                  {!preview ? (
                    <PageSpinner />
                  ) : (
                    <div className="flex flex-col gap-4">
                      <RankResultsList rankEntries={preview.rankEntries} finalScoreDisplayScale={event.finalScoreDisplayScale} />
                      {preview.specialAwardEntries.length > 0 && <SpecialAwardsList entries={preview.specialAwardEntries} />}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* --- Publish & correct (design doc Section 4) --- */}
        <Card>
          <h2 className="mb-3 font-display text-lg text-ink">Published versions</h2>
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
                      <Badge tone={VERSION_STATUS_TONE[v.status]}>{v.status}</Badge>
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

                  <RankResultsList
                    rankEntries={versionDetail.rankEntries}
                    finalScoreDisplayScale={event.finalScoreDisplayScale}
                    correctedSubmissionId={versionDetail.correctedSubmissionId}
                    correctionReason={versionDetail.correctionReason}
                    renderActions={
                      versionDetail.status === 'LIVE'
                        ? (row) =>
                            row.isDisqualified ? null : (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openCorrection('REORDER', row)}>
                                  Adjust rank
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openCorrection('SCORE_OVERRIDE', row)}>
                                  Override score
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openCorrection('DISQUALIFY', row)}>
                                  Disqualify
                                </Button>
                              </div>
                            )
                        : undefined
                    }
                  />
                  {versionDetail.specialAwardEntries.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-2 text-sm font-medium text-ink">Special awards</h3>
                      <SpecialAwardsList entries={versionDetail.specialAwardEntries} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={unpublishOpen}
        title="Unpublish these results?"
        description="Participants will immediately see 'Results haven't been published yet' again."
        confirmLabel="Unpublish"
        requireReason
        loading={unpublishBusy}
        onConfirm={handleUnpublish}
        onCancel={() => setUnpublishOpen(false)}
      />

      <ConfirmDialog
        open={correction !== null}
        title={
          correction?.type === 'DISQUALIFY'
            ? 'Disqualify this submission?'
            : correction?.type === 'REORDER'
              ? 'Adjust this submission’s rank?'
              : 'Override this submission’s displayed score?'
        }
        description={`${correction?.row.submission?.title || 'This submission'} — this creates a new published version and is visibly marked as a correction. Requires a reason.`}
        confirmLabel="Confirm correction"
        requireReason
        extraValid={correctionExtraValid()}
        loading={correctionBusy}
        onConfirm={submitCorrection}
        onCancel={() => setCorrection(null)}
      >
        {correction?.type !== 'DISQUALIFY' && (
          <div className="mt-3">
            <label htmlFor="correction-extra" className="text-sm font-medium text-ink">
              {correction?.type === 'REORDER' ? 'New rank' : 'New displayed score'}
            </label>
            <Input
              id="correction-extra"
              type="number"
              min={correction?.type === 'REORDER' ? 1 : undefined}
              className="mt-1.5"
              value={correctionExtra}
              onChange={(e) => setCorrectionExtra(e.target.value)}
            />
          </div>
        )}
        <ApiErrorAlert error={correctionError} />
      </ConfirmDialog>
    </Container>
  );
}
