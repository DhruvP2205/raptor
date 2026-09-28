'use client';

import { SubmissionCard } from '@/components/submissions/SubmissionCard';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  ApiError,
  getEvent,
  getForScoring,
  getSubmission,
  saveScoreDraft,
  submitReview,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { PublicEvent, RubricCriterion, ScoringData, Submission } from '@raptor/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface ScoreEntry {
  value: number | '';
  note: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function ScoringInterfacePage() {
  const { ready } = useRequireAuth();
  const { slug, assignmentId } = useParams<{ slug: string; assignmentId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [scoring, setScoring] = useState<ScoringData | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [noLongerYours, setNoLongerYours] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => setEvent(e))
      .catch(setError);
    getForScoring(assignmentId)
      .then((data) => {
        setScoring(data);
        setFeedback(data.overallFeedback ?? '');
        const initial: Record<string, ScoreEntry> = {};
        for (const s of data.scores) initial[s.criterionId] = { value: s.value, note: s.note ?? '' };
        setScores(initial);
        return getSubmission(data.submissionId);
      })
      .then(setSubmission)
      .catch(setError);
  }, [ready, slug, assignmentId]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this assignment.</Alert>
      </Container>
    );
  }
  if (!event || !submission || !scoring) return <PageSpinner />;

  const judgingClosed = Date.now() > new Date(event.judgingClosesAt).getTime();
  const readOnly = judgingClosed || scoring.status === 'TRANSFERRED';
  const scoringCriteria = scoring.criteria.filter((c) => c.kind === 'SCORING');
  const bonusCriteria = scoring.criteria.filter((c) => c.kind === 'BONUS');
  const specialAwardCriteria = scoring.criteria.filter((c) => c.kind === 'SPECIAL_AWARD');

  function setScore(criterionId: string, patch: Partial<ScoreEntry>) {
    setScores((prev) => ({ ...prev, [criterionId]: { ...(prev[criterionId] ?? { value: '', note: '' }), ...patch } }));
  }

  function buildScoresPayload() {
    return Object.entries(scores)
      .filter(([, entry]) => entry.value !== '')
      .map(([criterionId, entry]) => ({
        criterionId,
        value: Number(entry.value),
        note: entry.note || undefined,
      }));
  }

  // Raw persist, no local loading/error state of its own — handleSave
  // and handleConfirmSubmit each wrap this with their own UI state,
  // since submitReview validates against whatever is currently
  // persisted (Section 4.2), so the latest local edits must actually
  // reach the server first, not just be assumed already-saved.
  async function persistDraft(): Promise<ScoringData> {
    const updated = await saveScoreDraft(assignmentId, { scores: buildScoresPayload(), overallFeedback: feedback });
    setScoring(updated);
    return updated;
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await persistDraft();
      setSavedAt(new Date());
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSIGNMENT_TRANSFERRED') {
        setNoLongerYours(true);
      } else {
        setSaveError(err);
      }
    } finally {
      setSaving(false);
    }
  }

  // design/08-rubric-and-scoring.md Section 4 States — "Submit clicked, a
  // required scoring criterion is empty: Inline errors... confirmation
  // modal never opens on an invalid form." Mirrors submitReview's own
  // check (every SCORING criterion needs a value, overallFeedback
  // non-empty) client-side, same pre-check pattern as Module 5.
  function handleSubmitClick() {
    const missing = new Set<string>();
    for (const c of scoringCriteria) {
      if (scores[c.id]?.value === undefined || scores[c.id]?.value === '') missing.add(c.id);
    }
    if (!feedback.trim()) missing.add('overallFeedback');
    if (missing.size > 0) {
      setMissingIds(missing);
      const firstId = scoringCriteria.find((c) => missing.has(c.id))?.id;
      document.getElementById(firstId ? `score-${firstId}` : 'overallFeedback')?.focus();
      return;
    }
    setMissingIds(new Set());
    setConfirmSubmit(true);
  }

  async function handleConfirmSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await persistDraft();
      const updated = await submitReview(assignmentId);
      setScoring(updated);
      setConfirmSubmit(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSIGNMENT_TRANSFERRED') {
        setNoLongerYours(true);
        setConfirmSubmit(false);
      } else if (err instanceof ApiError && err.code === 'INCOMPLETE_REVIEW') {
        setMissingIds(new Set(err.fields?.map((f) => f.replace('criterion:', '')) ?? []));
        setConfirmSubmit(false);
      } else {
        setSubmitError(err);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (noLongerYours) {
    return (
      <Container className="py-16">
        <Alert tone="neutral">This assignment is no longer yours.</Alert>
        <Link href={`/events/${slug}/assignments/mine`} className="mt-4 inline-block text-sm text-accent-to underline">
          Back to my assigned projects
        </Link>
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl py-10">
      <Link href={`/events/${slug}/assignments/mine`} className="text-xs text-ink-muted hover:text-accent">
        ← My assigned projects
      </Link>

      <Card className="mt-4">
        <SubmissionCard submission={submission} />
      </Card>

      {judgingClosed && (
        <div className="mt-4">
          <Alert tone="neutral">
            Judging closed on {formatDateTime(event.judgingClosesAt)}. Your last submitted review is shown below.
          </Alert>
        </div>
      )}
      {!judgingClosed && scoring.status === 'COMPLETED' && scoring.submittedAt && (
        <div className="mt-4">
          <Alert tone="success">Last submitted {timeAgo(scoring.submittedAt)}.</Alert>
        </div>
      )}

      <Card className="mt-4">
        <h2 className="font-display text-lg text-ink">Scoring criteria</h2>
        <div className="mt-4 flex flex-col gap-5">
          {scoringCriteria.map((c) => (
            <RubricScoringInput
              key={c.id}
              criterion={c}
              entry={scores[c.id] ?? { value: '', note: '' }}
              onChange={(patch) => setScore(c.id, patch)}
              disabled={readOnly}
              missing={missingIds.has(c.id)}
            />
          ))}
        </div>
      </Card>

      {bonusCriteria.length > 0 && (
        <Card className="mt-4 bg-paper-raised">
          <h2 className="font-display text-base text-ink">Bonus tracks</h2>
          <p className="mt-1 text-xs text-ink-muted">Optional — never required to submit.</p>
          <div className="mt-3 flex flex-col gap-3">
            {bonusCriteria.map((c) => (
              <Field key={c.id} label={`${c.label} (0–${c.maxPoints})`} htmlFor={`score-${c.id}`} hint={c.description}>
                <Input
                  id={`score-${c.id}`}
                  type="number"
                  min={0}
                  max={c.maxPoints ?? 0}
                  value={scores[c.id]?.value ?? ''}
                  onChange={(e) => setScore(c.id, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                  disabled={readOnly}
                  className="max-w-[8rem]"
                />
              </Field>
            ))}
          </div>
        </Card>
      )}

      {/* "That whole section is simply absent... not shown empty" —
          design doc Section 4 States. */}
      {specialAwardCriteria.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-display text-base text-ink">Special awards</h2>
          <div className="mt-3 flex flex-col gap-2">
            {specialAwardCriteria.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scores[c.id]?.value === 1}
                  disabled={readOnly}
                  onChange={(e) => setScore(c.id, { value: e.target.checked ? 1 : 0 })}
                />
                Nominate for {c.label}
              </label>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <Field label="Overall feedback" htmlFor="overallFeedback" required error={missingIds.has('overallFeedback') ? 'Required before submitting.' : undefined}>
          <Textarea
            id="overallFeedback"
            minRows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={readOnly}
          />
        </Field>
      </Card>

      {!readOnly && (
        <>
          <ApiErrorAlert error={saveError} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" loading={saving} onClick={handleSave}>
              Save draft
            </Button>
            {savedAt && <span className="text-xs text-ink-faint">Saved {formatDateTime(savedAt.toISOString())}</span>}
          </div>

          <ApiErrorAlert error={submitError} />
          <div className="mt-3 flex gap-3 border-t border-line pt-4">
            <Button onClick={handleSubmitClick}>
              {scoring.status === 'COMPLETED' ? 'Update review' : 'Submit review'}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        danger={false}
        title="Submit this review?"
        description={`You can still make changes until judging closes on ${formatDateTime(event.judgingClosesAt)}.`}
        confirmLabel={scoring.status === 'COMPLETED' ? 'Update review' : 'Submit review'}
        loading={submitting}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmSubmit(false)}
      />
    </Container>
  );
}

function RubricScoringInput({
  criterion,
  entry,
  onChange,
  disabled,
  missing,
}: {
  criterion: RubricCriterion;
  entry: ScoreEntry;
  onChange: (patch: Partial<ScoreEntry>) => void;
  disabled: boolean;
  missing: boolean;
}) {
  const numeric = entry.value === '' ? 0 : entry.value;
  return (
    <div className="rounded border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{criterion.label}</p>
        <Input
          id={`score-${criterion.id}`}
          type="number"
          min={0}
          max={100}
          value={entry.value}
          disabled={disabled}
          onChange={(e) => onChange({ value: e.target.value === '' ? '' : Number(e.target.value) })}
          className="w-20"
        />
      </div>
      <p className="mt-1 text-xs text-ink-muted">{criterion.description}</p>
      <input
        type="range"
        min={0}
        max={100}
        value={numeric}
        disabled={disabled}
        onChange={(e) => onChange({ value: Number(e.target.value) })}
        className="mt-2 w-full"
      />
      {missing && <p className="mt-1 text-xs font-medium text-danger">Required before submitting.</p>}
      <Textarea
        className="mt-2"
        minRows={1}
        placeholder="Note (optional)"
        value={entry.note}
        disabled={disabled}
        onChange={(e) => onChange({ note: e.target.value })}
      />
    </div>
  );
}
