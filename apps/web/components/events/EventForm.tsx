'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import type { EventTimelineInput } from '@/lib/api';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/format';
import { useState } from 'react';

const TIMELINE_FIELDS: { key: keyof EventTimelineInput; label: string }[] = [
  { key: 'registrationOpensAt', label: 'Registration opens' },
  { key: 'registrationClosesAt', label: 'Registration closes' },
  { key: 'eventStartsAt', label: 'Event starts' },
  { key: 'submissionsOpenAt', label: 'Submissions open' },
  { key: 'submissionsCloseAt', label: 'Submissions close' },
  { key: 'eventEndsAt', label: 'Event ends' },
  { key: 'judgingClosesAt', label: 'Judging closes' },
  { key: 'resultsAnnounceAt', label: 'Results announced' },
  { key: 'votingOpensAt', label: 'Voting opens' },
  { key: 'votingClosesAt', label: 'Voting closes' },
  { key: 'votingWinnerAnnounceAt', label: 'Winners announced' },
  { key: 'eventClosedAt', label: 'Event closes' },
];

// Matches the exact ordering chain apps/api/src/events/utils/event-timeline.ts
// enforces server-side — this is a UX hint only, the server re-validates
// regardless of what the form lets the user type.
const ORDER_HINT =
  'Registration opens < closes ≤ event starts < submissions open < close ≤ event ends < judging closes ≤ results announced < voting opens < closes < winners announced < event closes.';

interface EventFormValues extends EventTimelineInput {}

export function EventForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<EventFormValues>;
  onSubmit: (values: EventFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const [values, setValues] = useState<EventFormValues>({
    name: initial?.name ?? '',
    slug: initial?.slug,
    description: initial?.description ?? '',
    maxTeamSize: initial?.maxTeamSize ?? 4,
    trackAttachmentMode: initial?.trackAttachmentMode ?? 'NONE',
    registrationOpensAt: initial?.registrationOpensAt ?? '',
    registrationClosesAt: initial?.registrationClosesAt ?? '',
    eventStartsAt: initial?.eventStartsAt ?? '',
    submissionsOpenAt: initial?.submissionsOpenAt ?? '',
    submissionsCloseAt: initial?.submissionsCloseAt ?? '',
    eventEndsAt: initial?.eventEndsAt ?? '',
    judgingClosesAt: initial?.judgingClosesAt ?? '',
    resultsAnnounceAt: initial?.resultsAnnounceAt ?? '',
    votingOpensAt: initial?.votingOpensAt ?? '',
    votingClosesAt: initial?.votingClosesAt ?? '',
    votingWinnerAnnounceAt: initial?.votingWinnerAnnounceAt ?? '',
    eventClosedAt: initial?.eventClosedAt ?? '',
  });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event name" htmlFor="name" required>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Slug" htmlFor="slug" hint="Leave blank to auto-generate from the name.">
          <Input
            id="slug"
            value={values.slug ?? ''}
            onChange={(e) => update('slug', e.target.value)}
            pattern="[a-z0-9-]+"
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" hint="Markdown supported.">
        <Textarea
          id="description"
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max team size" htmlFor="maxTeamSize" hint="Admin counts toward this total.">
          <Input
            id="maxTeamSize"
            type="number"
            min={1}
            max={100}
            value={values.maxTeamSize}
            onChange={(e) => update('maxTeamSize', Number(e.target.value))}
          />
        </Field>
        <Field label="Track attachment" htmlFor="trackAttachmentMode">
          <Select
            id="trackAttachmentMode"
            value={values.trackAttachmentMode}
            onChange={(e) =>
              update('trackAttachmentMode', e.target.value as EventFormValues['trackAttachmentMode'])
            }
          >
            <option value="NONE">None — no track field</option>
            <option value="SINGLE">Single — pick one track</option>
            <option value="MULTIPLE">Multiple — pick several</option>
          </Select>
        </Field>
      </div>

      <div>
        <h3 className="font-display text-base text-ink">Timeline</h3>
        <p className="mt-1 text-xs text-ink-muted">{ORDER_HINT}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {TIMELINE_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} htmlFor={key} required>
              <Input
                id={key}
                type="datetime-local"
                value={toDatetimeLocalValue(values[key] as string)}
                onChange={(e) => update(key, fromDatetimeLocalValue(e.target.value) as never)}
                required
              />
            </Field>
          ))}
        </div>
      </div>

      <ApiErrorAlert error={error} />
      <Button type="submit" loading={loading} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
