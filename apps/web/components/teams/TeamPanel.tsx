'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { deleteTeam, kickTeamMember, regenerateTeamLink } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { TeamWithMembers } from '@raptor/shared';
import { useState } from 'react';

export function TeamPanel({
  team,
  currentUserId,
  onTeamUpdated,
  onTeamDeleted,
}: {
  team: TeamWithMembers;
  currentUserId: string;
  onTeamUpdated: (t: TeamWithMembers) => void;
  onTeamDeleted: () => void;
}) {
  const isAdmin = team.adminUserId === currentUserId;
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ userId: string; displayName: string } | null>(null);

  const joinCode = `${team.joinLinkPrefix}-${team.joinLinkSuffix}`;

  async function handleRegenerate() {
    setLoading(true);
    setError(null);
    try {
      const updated = await regenerateTeamLink(team.id);
      onTeamUpdated({ ...team, ...updated });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleKick() {
    if (!kickTarget) return;
    setLoading(true);
    setError(null);
    try {
      await kickTeamMember(team.id, kickTarget.userId);
      onTeamUpdated({ ...team, members: team.members.filter((m) => m.userId !== kickTarget.userId) });
      setKickTarget(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      await deleteTeam(team.id);
      onTeamDeleted();
    } catch (err) {
      setError(err);
      setLoading(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl text-ink">{team.name}</h2>
        <p className="mt-1 text-xs text-ink-muted">
          {team.members.length} member{team.members.length === 1 ? '' : 's'}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-ink">Join code</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded border border-line-strong bg-paper-raised px-3 py-1.5 font-mono text-sm">
            {joinCode}
          </code>
          {isAdmin && (
            <Button size="sm" variant="secondary" loading={loading} onClick={handleRegenerate}>
              Regenerate
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          Share this with teammates. Regenerating invalidates the old code immediately.
        </p>
      </div>

      <ApiErrorAlert error={error} />

      <div>
        <p className="text-sm font-medium text-ink">Members</p>
        <ul className="mt-2 flex flex-col gap-2">
          {team.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between border-b border-line py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                {m.displayName}
                {m.userId === team.adminUserId && <Badge tone="accent">Admin</Badge>}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-faint">joined {formatDateTime(m.joinedAt)}</span>
                {isAdmin && m.userId !== team.adminUserId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setKickTarget({ userId: m.userId, displayName: m.displayName })}
                  >
                    Kick
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {isAdmin && (
        <div className="border-t border-line pt-4">
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete team
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!kickTarget}
        title={`Remove ${kickTarget?.displayName}?`}
        description="They'll need a fresh join code to come back."
        confirmLabel="Remove"
        loading={loading}
        onConfirm={handleKick}
        onCancel={() => setKickTarget(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this team?"
        description="This removes every member and cannot be undone. Any drafted submission is deleted with it."
        confirmLabel="Delete team"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
