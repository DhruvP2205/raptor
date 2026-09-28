'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { joinTeam } from '@/lib/api';
import { useState } from 'react';

export function JoinTeamForm({ onJoined }: { onJoined: () => void }) {
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
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Join code" htmlFor="join-code" required hint="e.g. team-xmass-482913">
        <Input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="font-mono"
        />
      </Field>
      <ApiErrorAlert error={error} />
      <Button type="submit" variant="secondary" loading={loading} fullWidth>
        Join team
      </Button>
    </form>
  );
}
