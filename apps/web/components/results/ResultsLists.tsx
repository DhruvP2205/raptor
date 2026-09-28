'use client';

import { Badge } from '@/components/ui/Badge';
import type { RankResultRow, SpecialAwardResultRow } from '@raptor/shared';
import { useState } from 'react';

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// docs/design/10-results-and-rankings.md Section 2 — "a small 'Corrected'
// tag with the reason available on click/tap," never a hover-only
// tooltip (this app has no tooltip primitive, and click/tap is what the
// doc actually asks for anyway).
function CorrectedTag({ reason }: { reason: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
      >
        Corrected
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-1 w-56 rounded border border-line bg-white p-2 text-xs text-ink-muted shadow-overlay">
          {reason || 'No reason recorded.'}
        </span>
      )}
    </span>
  );
}

// Dense ranking with genuine tie-sharing (Section 3/Section 2 states
// table) — tied rows are grouped under one shared ordinal marker, never
// duplicate "2nd" labels that would read as a display bug.
export function RankResultsList({
  rankEntries,
  finalScoreDisplayScale,
  correctedSubmissionId,
  correctionReason,
  renderActions,
}: {
  rankEntries: RankResultRow[];
  finalScoreDisplayScale: number;
  correctedSubmissionId?: string | null;
  correctionReason?: string | null;
  renderActions?: (row: RankResultRow) => React.ReactNode;
}) {
  const groups = new Map<number, RankResultRow[]>();
  for (const row of rankEntries) {
    const list = groups.get(row.rank) ?? [];
    list.push(row);
    groups.set(row.rank, list);
  }
  const sortedRanks = [...groups.keys()].sort((a, b) => a - b);

  if (rankEntries.length === 0) {
    return <p className="text-sm text-ink-muted">No ranked entries.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {sortedRanks.map((rank) => {
        const rows = groups.get(rank)!;
        return (
          <li key={rank}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg text-ink">{ordinal(rank)}</span>
              {rows.length > 1 && <span className="text-xs text-ink-muted">Tied — sharing this position.</span>}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {rows.map((row) => {
                const overachiever = row.displayScore > finalScoreDisplayScale;
                const isCorrected = correctedSubmissionId != null && correctedSubmissionId === row.submissionId;
                return (
                  <div
                    key={row.submissionId}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3 ${
                      row.isDisqualified ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{row.submission?.title || 'Untitled submission'}</span>
                      {row.isDisqualified && <Badge tone="danger">Disqualified</Badge>}
                      {isCorrected && <CorrectedTag reason={correctionReason ?? null} />}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-ink-muted">
                        {row.displayScore.toFixed(2)} / {finalScoreDisplayScale}
                        {overachiever && <span className="ml-1.5 text-xs font-medium text-accent">Overachiever</span>}
                      </span>
                      {renderActions?.(row)}
                    </div>
                  </div>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SpecialAwardsList({ entries }: { entries: SpecialAwardResultRow[] }) {
  if (entries.length === 0) return null;
  const byCriterion = new Map<string, SpecialAwardResultRow[]>();
  for (const row of entries) {
    const list = byCriterion.get(row.criterionId) ?? [];
    list.push(row);
    byCriterion.set(row.criterionId, list);
  }
  return (
    <ul className="flex flex-col gap-3">
      {[...byCriterion.entries()].map(([criterionId, rows]) => (
        <li key={criterionId} className="rounded border border-line p-3">
          <p className="font-medium text-ink">{rows[0].criterion?.label ?? 'Special award'}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {rows.map((row) => (
              <Badge key={row.submissionId} tone="accent">
                {row.submission?.title || 'Untitled submission'}
              </Badge>
            ))}
          </div>
          {rows.length > 1 && rows[0].isShared && (
            <p className="mt-1 text-xs text-ink-muted">Tied — sharing this award.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
