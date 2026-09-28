'use client';

import { Badge } from '@/components/ui/Badge';
import type { VotingResultEntry } from '@raptor/shared';
import { useState } from 'react';

// Same click-to-reveal pattern as Module 10's ResultsLists — see that
// component's own comment for why (no tooltip primitive; doc wants
// click/tap, not hover, anyway).
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

export function VotingResultsList({
  entries,
  correctedSubmissionId,
  correctionReason,
  renderActions,
}: {
  entries: VotingResultEntry[];
  correctedSubmissionId?: string | null;
  correctionReason?: string | null;
  renderActions?: (entry: VotingResultEntry) => React.ReactNode;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-muted">No votes recorded.</p>;
  }
  const sorted = [...entries].sort((a, b) => b.voteCount - a.voteCount);

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((entry) => {
        const isCorrected = correctedSubmissionId != null && correctedSubmissionId === entry.submissionId;
        return (
          <li
            key={entry.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3 ${
              entry.isDisqualified ? 'opacity-60' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{entry.submission?.title || 'Untitled submission'}</span>
              {entry.isSharedWin && !entry.isDisqualified && <Badge tone="accent">Winner</Badge>}
              {entry.isDisqualified && <Badge tone="danger">Disqualified</Badge>}
              {isCorrected && <CorrectedTag reason={correctionReason ?? null} />}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-ink-muted">
                {entry.voteCount} votes ({entry.votePercentage.toFixed(1)}%)
              </span>
              {renderActions?.(entry)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
