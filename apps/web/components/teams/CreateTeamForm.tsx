'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ApiError, createTeam } from '@/lib/api';
import type { Team } from '@raptor/shared';
import { useState } from 'react';

// docs/design/04-team-management.md Section 2 States. `onAlreadyOnTeam`
// re-triggers the parent's team fetch — that's the "redirect to the
// existing team's panel" the doc wants for ALREADY_ON_A_TEAM, since
// this is a single-page app where re-fetching naturally swaps the
// create/join prompt for the team panel.
export function CreateTeamForm({
  eventId,
  onCreated,
  onAlreadyOnTeam,
}: {
  eventId: string;
  onCreated: (t: Team) => void;
  onAlreadyOnTeam?: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onCreated(await createTeam(eventId, name));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_ON_A_TEAM') {
        onAlreadyOnTeam?.();
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  const nameError =
    error instanceof ApiError && error.code === 'TEAM_NAME_TAKEN'
      ? 'A team already has this name for this event.'
      : undefined;
  const hardBlockMessage =
    error instanceof ApiError && error.code === 'ALREADY_ON_A_TEAM'
      ? "You're already on a team for this event — taking you there now."
      : error instanceof ApiError && error.code === 'ALREADY_HAS_SOLO_SUBMISSION'
        ? 'You already have a solo submission for this event.'
        : null;
  const genericError = error instanceof ApiError && !nameError && !hardBlockMessage ? error : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field
        label="Team name"
        htmlFor="team-name"
        required
        hint="Permanent once set — cannot be renamed later."
        error={nameError}
      >
        <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </Field>
      {hardBlockMessage && <p className="text-xs font-medium text-danger">{hardBlockMessage}</p>}
      <ApiErrorAlert error={genericError} />
      <Button type="submit" loading={loading} fullWidth>
        Create team
      </Button>
    </form>
  );
}
