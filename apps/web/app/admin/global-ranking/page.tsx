'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { getGlobalPointsConfig, triggerGlobalRankingRecompute, updateGlobalPointsConfig } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { GlobalAwardKind, GlobalPointsConfigRow } from '@raptor/shared';
import { useEffect, useState } from 'react';

const AWARD_KIND_LABEL: Record<GlobalAwardKind, string> = {
  PODIUM_FIRST: '1st place (podium)',
  PODIUM_SECOND: '2nd place (podium)',
  PODIUM_THIRD: '3rd place (podium)',
  SPECIAL_AWARD: 'Special award',
  AUDIENCE_CHOICE: 'Audience-choice voting win',
};

export default function GlobalRankingAdminPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<GlobalPointsConfigRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKind, setSavingKind] = useState<GlobalAwardKind | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  const [recomputeOpen, setRecomputeOpen] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [recomputeError, setRecomputeError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready || !user?.siteAdmin) return;
    getGlobalPointsConfig()
      .then((list) => {
        setRows(list);
        setDrafts(Object.fromEntries(list.map((r) => [r.awardKind, String(r.points)])));
      })
      .catch(setError);
  }, [ready, user]);

  if (!ready) return <PageSpinner />;

  // UX-only gate — SiteAdminGuard independently rejects this route
  // server-side for anyone without the siteAdmin flag.
  if (!user?.siteAdmin) {
    return (
      <Container className="py-16">
        <Alert tone="warning">This page requires platform-admin access.</Alert>
      </Container>
    );
  }
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load the points configuration.</Alert>
      </Container>
    );
  }
  if (!rows) return <PageSpinner />;

  async function handleSave(awardKind: GlobalAwardKind) {
    const value = Number(drafts[awardKind]);
    if (!Number.isInteger(value) || value < 0) return;
    setSavingKind(awardKind);
    setSaveError(null);
    try {
      const updated = await updateGlobalPointsConfig(awardKind, value);
      setRows((list) => (list ?? []).map((r) => (r.awardKind === awardKind ? updated : r)));
      showToast('Points updated.');
    } catch (err) {
      setSaveError(err);
    } finally {
      setSavingKind(null);
    }
  }

  async function handleRecompute(reason?: string) {
    setRecomputeBusy(true);
    setRecomputeError(null);
    try {
      await triggerGlobalRankingRecompute(reason);
      setRecomputeOpen(false);
      showToast('Recompute triggered.');
    } catch (err) {
      setRecomputeError(err);
    } finally {
      setRecomputeBusy(false);
    }
  }

  return (
    <Container className="py-10">
      <h1 className="mb-1 font-display text-2xl text-ink">Global ranking</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Platform-wide points table and manual recompute — not per-event.
      </p>

      <Card className="mb-6 max-w-2xl">
        <h2 className="mb-3 font-display text-lg text-ink">Points table</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Editing a value doesn&apos;t rewrite past snapshots — it takes effect on the next recompute.
        </p>
        <ApiErrorAlert error={saveError} />
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.awardKind} className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
              <Field label={AWARD_KIND_LABEL[row.awardKind]} htmlFor={`points-${row.awardKind}`}>
                <Input
                  id={`points-${row.awardKind}`}
                  type="number"
                  min={0}
                  value={drafts[row.awardKind] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.awardKind]: e.target.value }))}
                  className="w-24"
                />
              </Field>
              <Button
                size="sm"
                variant="secondary"
                loading={savingKind === row.awardKind}
                disabled={drafts[row.awardKind] === String(row.points)}
                onClick={() => handleSave(row.awardKind)}
              >
                Save
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="max-w-2xl">
        <h2 className="mb-1 font-display text-lg text-ink">Manual recompute</h2>
        <p className="mb-3 text-xs text-ink-muted">
          The leaderboard already recomputes automatically whenever a result is published — use this only when you
          need it to reflect a change immediately.
        </p>
        <ApiErrorAlert error={recomputeError} />
        <Button size="sm" onClick={() => setRecomputeOpen(true)}>
          Recompute now
        </Button>
      </Card>

      <ConfirmDialog
        open={recomputeOpen}
        danger={false}
        title="Trigger a manual recompute?"
        description="Rebuilds the current leaderboard snapshot from all published results right now."
        confirmLabel="Recompute now"
        loading={recomputeBusy}
        onConfirm={handleRecompute}
        onCancel={() => setRecomputeOpen(false)}
      />
    </Container>
  );
}
