import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-faint',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

// A dot + label, normal case, thin border — a status indicator you'd
// see in an actual product (Linear/Vercel), not an uppercase pastel
// pill (that pattern is a generic-template tell).
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-ink-muted',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} />
      {children}
    </span>
  );
}
