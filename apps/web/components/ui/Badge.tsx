import { cn } from '@/lib/cn';

// DESIGN-SYSTEM.md 7.7 — exactly these four statuses; border + fill +
// text all come from the same semantic triple, not a mix-and-match of
// independent colors. "accent" (used for non-status labels like track
// chips or an "Admin" role tag — see Badge call sites) has no status
// equivalent in the doc, so it's mapped to `neutral` as the smallest
// reasonable reading: TODO: undocumented decision, needs confirmation.
export type Tone = 'live' | 'success' | 'neutral' | 'danger' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  live: 'border-warning-border bg-warning-soft text-warning',
  success: 'border-success-border bg-success-soft text-success',
  neutral: 'border-line bg-paper-raised text-ink-muted',
  danger: 'border-danger-border bg-danger-soft text-danger',
  accent: 'border-line bg-paper-raised text-ink-muted',
};

const DOT_CLASSES: Record<Tone, string> = {
  live: 'bg-warning',
  success: 'bg-success',
  neutral: 'bg-ink-faint',
  danger: 'bg-danger',
  accent: 'bg-ink-faint',
};

export function Badge({
  tone = 'neutral',
  pulse,
  className,
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const shouldPulse = pulse ?? tone === 'live';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone], shouldPulse && 'animate-pulse')} />
      {children}
    </span>
  );
}
