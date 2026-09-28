'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { createTeam } from '@/lib/api';
import type { Team } from '@raptor/shared';
import { useState } from 'react';

export function CreateTeamForm({ eventId, onCreated }: { eventId: string; onCreated: (t: Team) => void }) {
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
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Team name" htmlFor="team-name" required hint="Permanent once set — cannot be renamed later.">
        <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </Field>
      <ApiErrorAlert error={error} />
      <Button type="submit" loading={loading} fullWidth>
        Create team
      </Button>
    </form>
  );
}
