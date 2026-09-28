'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ApiError, patchSubmission, submitSubmission, unsubmitSubmission } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PublicEvent, Submission } from '@raptor/shared';
import { useState } from 'react';
import { MissingFieldsAlert } from './MissingFieldsAlert';

export function SubmissionForm({
  event,
  submission,
  onChange,
}: {
  event: PublicEvent;
  submission: Submission;
  onChange: (s: Submission) => void;
}) {
  const [title, setTitle] = useState(submission.title ?? '');
  const [description, setDescription] = useState(submission.description ?? '');
  const [repoUrl, setRepoUrl] = useState(submission.repoUrl ?? '');
  const [demoVideoUrl, setDemoVideoUrl] = useState(submission.demoVideoUrl ?? '');
  const [liveUrl, setLiveUrl] = useState(submission.liveUrl ?? '');
  const [trackIds, setTrackIds] = useState<string[]>(submission.trackIds);

  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const [submitError, setSubmitError] = useState<unknown>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmUnsubmit, setConfirmUnsubmit] = useState(false);
  const [busy, setBusy] = useState(false);

  const deadlinePassed = Date.now() > new Date(event.submissionsCloseAt).getTime();
  const tracks = event.tracks ?? [];
  // docs/design/05-submission-management.md Section 2 States —
  // "Submitted: Form becomes read-only... locked with an unlock path"
  // and "Deadline passed: Entire form becomes permanently read-only, no
  // Save/Submit/Unsubmit actions anywhere." Deadline passed is the
  // stronger/final state (no unlock path at all, unlike a plain submit).
  const readOnly = !submission.isDraft || deadlinePassed;

  function currentValues() {
    return {
      title,
      description,
      repoUrl: repoUrl || undefined,
      demoVideoUrl: demoVideoUrl || undefined,
      liveUrl: liveUrl || undefined,
      trackIds,
    };
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchSubmission(submission.id, currentValues());
      onChange(updated);
      setSavedAt(new Date());
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  // docs/design/05-submission-management.md Section 2 States — "Submit
  // clicked, required fields incomplete: Confirmation modal doesn't
  // open at all — inline errors on the missing fields instead, focus
  // moved to the first one." Mirrors submissions.service.ts's own
  // `submit()` check exactly (title, description, trackIds when the
  // event uses tracks) so the two never drift — this is a client-side
  // pre-check for UX, the backend re-validates regardless.
  function handleSubmitClick() {
    const missing: string[] = [];
    if (!title.trim()) missing.push('title');
    if (!description.trim()) missing.push('description');
    if (event.trackAttachmentMode !== 'NONE' && trackIds.length === 0) missing.push('trackIds');

    if (missing.length > 0) {
      setMissingFields(missing);
      if (missing[0] === 'trackIds') {
        // SINGLE mode has one focusable <select id="track">; MULTIPLE
        // mode is a checkbox group with no single field id to target,
        // so the first checkbox is the closest equivalent.
        (document.getElementById('track') ??
          document.querySelector<HTMLInputElement>('fieldset input[type="checkbox"]'))?.focus();
      } else {
        document.getElementById(missing[0])?.focus();
      }
      return;
    }
    setMissingFields([]);
    setConfirmSubmit(true);
  }

  async function handleConfirmSubmit() {
    setBusy(true);
    setSubmitError(null);
    setMissingFields([]);
    try {
      await patchSubmission(submission.id, currentValues());
      const updated = await submitSubmission(submission.id);
      onChange(updated);
      setConfirmSubmit(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MISSING_REQUIRED_FIELDS') {
        setMissingFields(err.fields ?? []);
        setConfirmSubmit(false);
      } else {
        setSubmitError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmUnsubmit() {
    setBusy(true);
    setSubmitError(null);
    try {
      const updated = await unsubmitSubmission(submission.id);
      onChange(updated);
      setConfirmUnsubmit(false);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setBusy(false);
    }
  }

  function toggleTrack(id: string) {
    setTrackIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line-strong bg-paper-raised px-4 py-3 text-sm">
        <span className={deadlinePassed ? 'font-medium text-danger' : 'text-ink-muted'}>
          {deadlinePassed
            ? `Submissions closed on ${formatDateTime(event.submissionsCloseAt)}.`
            : `Submissions close ${formatDateTime(event.submissionsCloseAt)}`}
        </span>
        {submission.everSubmitted && (
          <span className="font-mono text-xs text-ink-faint">
            {submission.isDraft ? 'Previously submitted, now in draft' : 'Finalized'}
          </span>
        )}
      </div>

      {/* Prominent, at the top — the design doc's "persistent Unsubmit
          action at the top" for the locked/submitted state specifically
          (not the permanently-closed deadline state, which has no
          unlock path at all). */}
      {!submission.isDraft && !deadlinePassed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-white px-4 py-3">
          <p className="text-sm text-ink">This submission is finalized and read-only.</p>
          <Button variant="secondary" size="sm" onClick={() => setConfirmUnsubmit(true)}>
            Unsubmit to keep editing
          </Button>
        </div>
      )}

      <MissingFieldsAlert fields={missingFields} />

      <Field label="Title" htmlFor="title" required>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={readOnly} />
      </Field>

      <Field label="Description" htmlFor="description" required hint="Markdown supported.">
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[12rem]"
          disabled={readOnly}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Repo URL"
          htmlFor="repoUrl"
          hint="Repository must be public for judging — private repos require manual verification and may be disqualified."
        >
          <Input id="repoUrl" type="url" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} disabled={readOnly} />
        </Field>
        <Field label="Demo video URL" htmlFor="demoVideoUrl">
          <Input
            id="demoVideoUrl"
            type="url"
            value={demoVideoUrl}
            onChange={(e) => setDemoVideoUrl(e.target.value)}
            disabled={readOnly}
          />
        </Field>
        <Field label="Live URL" htmlFor="liveUrl">
          <Input id="liveUrl" type="url" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} disabled={readOnly} />
        </Field>
      </div>

      {event.trackAttachmentMode === 'SINGLE' && tracks.length > 0 && (
        <Field label="Track" htmlFor="track" required>
          <Select
            id="track"
            value={trackIds[0] ?? ''}
            onChange={(e) => setTrackIds(e.target.value ? [e.target.value] : [])}
            disabled={readOnly}
          >
            <option value="">Select a track</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {event.trackAttachmentMode === 'MULTIPLE' && tracks.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-ink">
            Tracks <span className="text-accent">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {tracks.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={trackIds.includes(t.id)}
                  onChange={() => toggleTrack(t.id)}
                  disabled={readOnly}
                />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Deadline passed: no Save/Submit/Unsubmit anywhere, entire form
          permanently read-only (design doc). Submitted-but-before-
          deadline keeps only the top banner's Unsubmit — repeating it
          here too would be redundant, not a second valid path. */}
      {submission.isDraft && !deadlinePassed && (
        <>
          <ApiErrorAlert error={saveError} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" loading={saving} onClick={handleSave}>
              Save draft
            </Button>
            {savedAt && <span className="text-xs text-ink-faint">Saved {formatDateTime(savedAt.toISOString())}</span>}
          </div>

          <ApiErrorAlert error={submitError} />
          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <Button onClick={handleSubmitClick}>Submit</Button>
          </div>
        </>
      )}
      {!submission.isDraft && !deadlinePassed && <ApiErrorAlert error={submitError} />}

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit this entry?"
        description="This finalizes your submission. You can still edit it by un-submitting, right up until the deadline."
        confirmLabel="Submit"
        danger={false}
        loading={busy}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmSubmit(false)}
      />
      <ConfirmDialog
        open={confirmUnsubmit}
        title="Unsubmit?"
        description="This pulls your entry back to draft so you can keep editing. Submit again before the deadline to finalize it."
        confirmLabel="Unsubmit"
        loading={busy}
        onConfirm={handleConfirmUnsubmit}
        onCancel={() => setConfirmUnsubmit(false)}
      />
    </div>
  );
}
