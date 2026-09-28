'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, getEvent, replaceRubric } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { PublicEvent, RubricCriterion, RubricCriterionKind } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const BONUS_GUARDRAIL_THRESHOLD = 20;

interface DraftCriterion {
  key: string;
  kind: RubricCriterionKind;
  label: string;
  description: string;
  weightPercent?: number;
  maxPoints?: number;
}

function toDraft(c: RubricCriterion): DraftCriterion {
  return {
    key: c.id,
    kind: c.kind,
    label: c.label,
    description: c.description,
    weightPercent: c.weightPercent ?? undefined,
    maxPoints: c.maxPoints ?? undefined,
  };
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `new-${keyCounter}`;
}

export default function RubricBuilderPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const { showToast } = useToast();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [criteria, setCriteria] = useState<DraftCriterion[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOverage, setConfirmOverage] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        setCriteria((e.rubricCriteria ?? []).map(toDraft));
      })
      .catch(setError);
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event) return <PageSpinner />;

  // docs/stages/08-rubric-and-scoring.md's actual implementation locks
  // the *entire* rubric once judging begins (now() >= eventEndsAt) —
  // simpler/coarser than design/08's own states table, which describes
  // blocking only the removal of a criterion that already has scores.
  // Corrected to match the real backend condition rather than invented
  // per-criterion tracking the API has no way to answer.
  // TODO: undocumented decision, needs confirmation.
  const locked = Date.now() >= new Date(event.eventEndsAt).getTime();

  const scoring = criteria.filter((c) => c.kind === 'SCORING');
  const bonus = criteria.filter((c) => c.kind === 'BONUS');
  const specialAward = criteria.filter((c) => c.kind === 'SPECIAL_AWARD');
  const weightSum = scoring.reduce((sum, c) => sum + (c.weightPercent ?? 0), 0);
  const bonusSum = bonus.reduce((sum, c) => sum + (c.maxPoints ?? 0), 0);
  const weightValid = scoring.length > 0 && weightSum === 100;

  function update(key: string, patch: Partial<DraftCriterion>) {
    setCriteria((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }
  function remove(key: string) {
    setCriteria((list) => list.filter((c) => c.key !== key));
  }
  function add(kind: RubricCriterionKind) {
    setCriteria((list) => [
      ...list,
      {
        key: newKey(),
        kind,
        label: '',
        description: '',
        weightPercent: kind === 'SCORING' ? 0 : undefined,
        maxPoints: kind === 'BONUS' ? 0 : undefined,
      },
    ]);
  }

  async function doSave(acknowledgeBonusOverage?: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      const updatedCriteria = await replaceRubric(event!.id, {
        criteria: criteria.map((c) => ({
          kind: c.kind,
          label: c.label,
          description: c.description,
          weightPercent: c.kind === 'SCORING' ? c.weightPercent : undefined,
          maxPoints: c.kind === 'BONUS' ? c.maxPoints : undefined,
        })),
        acknowledgeBonusOverage,
      });
      setCriteria(updatedCriteria.map(toDraft));
      setConfirmOverage(false);
      showToast('Rubric saved.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BONUS_GUARDRAIL_ACK_REQUIRED') {
        setConfirmOverage(true);
      } else {
        setSaveError(err);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — rubric</h1>
      <p className="mb-6 text-sm text-ink-muted">Defines what judges score against for this event.</p>

      {locked && (
        <div className="mb-4">
          <Alert tone="neutral">
            Judging has already begun for this event — the rubric can no longer be changed.
          </Alert>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Scoring criteria</h2>
            <span className={`font-mono text-sm ${weightValid ? 'text-ink-muted' : 'text-danger'}`}>
              {weightSum === 100 ? 'Total: 100%' : `Total: ${weightSum}% — ${weightSum < 100 ? `add ${100 - weightSum}% more` : `remove ${weightSum - 100}%`}`}
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {scoring.map((c) => (
              <div key={c.key} className="rounded border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label="Label" htmlFor={`label-${c.key}`} required>
                    <Input id={`label-${c.key}`} value={c.label} onChange={(e) => update(c.key, { label: e.target.value })} disabled={locked} />
                  </Field>
                  <Field label="Weight %" htmlFor={`weight-${c.key}`} required>
                    <Input
                      id={`weight-${c.key}`}
                      type="number"
                      min={1}
                      max={100}
                      value={c.weightPercent ?? 0}
                      onChange={(e) => update(c.key, { weightPercent: Number(e.target.value) })}
                      disabled={locked}
                      className="w-24"
                    />
                  </Field>
                </div>
                <Field label="Guidance" htmlFor={`desc-${c.key}`} required>
                  <Textarea id={`desc-${c.key}`} minRows={2} value={c.description} onChange={(e) => update(c.key, { description: e.target.value })} disabled={locked} />
                </Field>
                {!locked && (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => remove(c.key)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!locked && (
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => add('SCORING')}>
              Add scoring criterion
            </Button>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Bonus tracks</h2>
            <span className={`font-mono text-sm ${bonusSum > BONUS_GUARDRAIL_THRESHOLD ? 'text-warning' : 'text-ink-muted'}`}>
              Bonus tracks total: {bonusSum} points
            </span>
          </div>
          {bonusSum > BONUS_GUARDRAIL_THRESHOLD && (
            <p className="mt-1 text-xs text-warning">
              Above the recommended threshold of {BONUS_GUARDRAIL_THRESHOLD} — you&apos;ll be asked to confirm at save time.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-4">
            {bonus.map((c) => (
              <div key={c.key} className="rounded border border-line bg-paper-raised p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label="Label" htmlFor={`label-${c.key}`} required>
                    <Input id={`label-${c.key}`} value={c.label} onChange={(e) => update(c.key, { label: e.target.value })} disabled={locked} />
                  </Field>
                  <Field label="Max points" htmlFor={`points-${c.key}`} required>
                    <Input
                      id={`points-${c.key}`}
                      type="number"
                      min={1}
                      value={c.maxPoints ?? 0}
                      onChange={(e) => update(c.key, { maxPoints: Number(e.target.value) })}
                      disabled={locked}
                      className="w-24"
                    />
                  </Field>
                </div>
                <Field label="Guidance" htmlFor={`desc-${c.key}`} required>
                  <Textarea id={`desc-${c.key}`} minRows={2} value={c.description} onChange={(e) => update(c.key, { description: e.target.value })} disabled={locked} />
                </Field>
                {!locked && (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => remove(c.key)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!locked && (
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => add('BONUS')}>
              Add bonus track
            </Button>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg text-ink">Special award criteria</h2>
          <p className="mt-1 text-xs text-ink-muted">No weight or points — nomination only.</p>
          <div className="mt-4 flex flex-col gap-4">
            {specialAward.map((c) => (
              <div key={c.key} className="rounded border border-line p-3">
                <Field label="Award name" htmlFor={`label-${c.key}`} required>
                  <Input id={`label-${c.key}`} value={c.label} onChange={(e) => update(c.key, { label: e.target.value })} disabled={locked} />
                </Field>
                <Field label="Guidance" htmlFor={`desc-${c.key}`} required>
                  <Textarea id={`desc-${c.key}`} minRows={2} value={c.description} onChange={(e) => update(c.key, { description: e.target.value })} disabled={locked} />
                </Field>
                {!locked && (
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => remove(c.key)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!locked && (
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => add('SPECIAL_AWARD')}>
              Add special award
            </Button>
          )}
        </Card>

        {!locked && (
          <div>
            <ApiErrorAlert error={saveError} />
            <Button loading={saving} disabled={!weightValid} onClick={() => doSave()}>
              Save rubric
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOverage}
        danger={false}
        title="Publish rubric anyway?"
        description={`Bonus tracks total ${bonusSum} points — this may let bonus outweigh project quality more than recommended.`}
        confirmLabel="Publish anyway"
        loading={saving}
        onConfirm={() => doSave(true)}
        onCancel={() => setConfirmOverage(false)}
      />
    </Container>
  );
}
