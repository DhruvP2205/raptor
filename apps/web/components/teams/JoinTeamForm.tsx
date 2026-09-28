'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ApiError, joinTeam } from '@/lib/api';
import { useState } from 'react';

// docs/design/04-team-management.md Section 2 States — specific inline
// copy per error code rather than the backend's raw message, matching
// what the doc prescribes verbatim for each case.
export function JoinTeamForm({
  onJoined,
  onAlreadyOnTeam,
}: {
  onJoined: () => void;
  onAlreadyOnTeam?: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await joinTeam(code.trim());
      onJoined();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_ON_A_TEAM') {
        onAlreadyOnTeam?.();
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  const codeError =
    error instanceof ApiError && error.code === 'INVALID_JOIN_CODE'
      ? "That link isn't valid. Ask your team admin for a current one."
      : error instanceof ApiError && error.code === 'TEAM_FULL'
        ? 'This team is already full.'
        : undefined;
  const genericError =
    error instanceof ApiError && !codeError && error.code !== 'ALREADY_ON_A_TEAM' ? error : null;
  const hardBlockMessage =
    error instanceof ApiError && error.code === 'ALREADY_ON_A_TEAM'
      ? "You're already on a team for this event — taking you there now."
      : error instanceof ApiError && error.code === 'ALREADY_HAS_SOLO_SUBMISSION'
        ? 'You already have a solo submission for this event.'
        : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Join code" htmlFor="join-code" required hint="e.g. team-xmass-482913" error={codeError}>
        <Input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="font-mono"
        />
      </Field>
      {hardBlockMessage && <p className="text-xs font-medium text-danger">{hardBlockMessage}</p>}
      <ApiErrorAlert error={genericError} />
      <Button type="submit" variant="secondary" loading={loading} fullWidth>
        Join team
      </Button>
    </form>
  );
}
