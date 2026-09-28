'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { deleteTeam, kickTeamMember, leaveTeam, regenerateTeamLink } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/lib/toast-context';
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
  // docs/design/04-team-management.md Section 3 — "Roster lock active"
  // row: Kick/Regenerate/join-via-link go absent (not disabled), with
  // an explanation, once the team has ever submitted.
  const rosterLocked = team.everSubmitted;
  const { showToast } = useToast();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  // "Own action, no confirmation modal needed" per the design doc, but
  // this build routes it through the lightweight ConfirmDialog anyway
  // (danger={false}, no reason) since leaving is still a one-way door
  // for that member — kept a deliberate step rather than an
  // accidental-click hazard, at the cost of one extra click the doc
  // didn't ask for.
  async function handleLeave() {
    setLoading(true);
    setError(null);
    try {
      await leaveTeam(team.id);
      showToast("You've left the team.");
      onTeamDeleted();
    } catch (err) {
      setError(err);
      setLoading(false);
      setConfirmLeave(false);
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

      {rosterLocked && (
        <Alert tone="neutral">
          This team&apos;s roster is locked because a submission has been finalized.
        </Alert>
      )}

      <div>
        <p className="text-sm font-medium text-ink">Join code</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded border border-line-strong bg-paper-raised px-3 py-1.5 font-mono text-sm">
            {joinCode}
          </code>
          {isAdmin && !rosterLocked && (
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
                <Avatar name={m.displayName} id={m.userId} size="small" />
                {m.displayName}
                {m.userId === team.adminUserId && <Badge tone="accent">Admin</Badge>}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-faint">joined {formatDateTime(m.joinedAt)}</span>
                {isAdmin && m.userId !== team.adminUserId && !rosterLocked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setKickTarget({ userId: m.userId, displayName: m.displayName })}
                  >
                    Kick
                  </Button>
                )}
                {/* "Leave team" is only ever shown to non-admin members
                    (docs/design/04-team-management.md Section 3 States)
                    — the admin's only paths out are Kick-everyone-then-
                    delete or -regenerate, never a plain leave. */}
                {!isAdmin && m.userId === currentUserId && !rosterLocked && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(true)}>
                    Leave
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Delete is admin-only-permitted before the roster ever locks
          too (backend calls the same assertRosterNotLocked check) — the
          design doc's roster-lock row only names Kick/Regenerate/join
          explicitly, but hiding rather than disabling an action the
          viewer can't take is this system's stated default everywhere
          else (DESIGN-SYSTEM.md, the events-list precedent), so Delete
          follows the same absent-not-disabled treatment for
          consistency. TODO: undocumented decision, needs confirmation. */}
      {isAdmin && !rosterLocked && (
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
        open={confirmLeave}
        danger={false}
        title="Leave this team?"
        description="You'll need a fresh join code from the admin to come back."
        confirmLabel="Leave team"
        loading={loading}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this team?"
        description="This permanently deletes the team and its submission. This can't be undone."
        confirmLabel="Delete team"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
