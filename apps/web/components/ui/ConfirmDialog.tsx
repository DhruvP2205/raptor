'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Textarea } from './Field';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  /** DESIGN-SYSTEM.md 7.6 — destructive actions default to requiring a
   * written reason (mirrors the backend rejecting a reason-less
   * disqualify/ban/etc. outright); explicitly false for the handful of
   * destructive actions the backend itself never asks a reason for
   * (team kick/delete — see docs/design/04-team-management.md). */
  requireReason?: boolean;
  /** Extra fields specific to one call site (e.g. Module 7's transfer
   * modal needs a receiving-judge picker alongside the reason) —
   * rendered between the description and the reason field, never a
   * second disconnected floating panel. */
  children?: React.ReactNode;
  /** Additional confirm-button gate beyond the reason requirement —
   * e.g. "a receiving judge has been picked." Defaults to always-true. */
  extraValid?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

// Every destructive/irreversible action in this app (delete team, kick
// a member, delete/archive an event, and — once those modules exist —
// disqualify/ban/moderate) routes through this. The backend
// re-validates `confirm`/`reason` itself regardless — this dialog is
// the UX half, not a substitute for that.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = true,
  loading,
  requireReason = false,
  children,
  extraValid = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  // Escape always works, even for the reason-required variant that
  // doesn't close on backdrop click (7.6) — a destructive modal still
  // needs a keyboard-only escape hatch.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const canConfirm = (!requireReason || reason.trim().length > 0) && extraValid;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-ink/40 p-4"
      // Reason-required destructive modals don't close on backdrop
      // click — prevents accidentally losing a half-typed reason (7.6).
      onClick={requireReason ? undefined : onCancel}
    >
      <div
        className="relative z-modal w-full max-w-sm rounded-lg border border-line bg-white p-5 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="font-display text-lg text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">{description}</p>
        {children}
        {requireReason && (
          <div className="mt-4">
            <label htmlFor="confirm-dialog-reason" className="text-sm font-medium text-ink">
              Reason
            </label>
            <Textarea
              id="confirm-dialog-reason"
              className="mt-1.5"
              minRows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            loading={loading}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
