import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/api';

type Tone = 'danger' | 'success' | 'warning' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  danger: 'border-danger/40 bg-danger-soft text-danger',
  success: 'border-success/40 bg-success-soft text-success',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  neutral: 'border-line-strong bg-paper-raised text-ink-muted',
};

export function Alert({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('rounded border px-4 py-3 text-sm', TONE_CLASSES[tone], className)}>
      {children}
    </div>
  );
}

// Surfaces the backend's actual error message/fields, never a generic
// "something went wrong" — errors carry a specific `code` and `message`
// by convention across every service in this project.
export function ApiErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const fields = error instanceof ApiError ? error.fields : undefined;
  return (
    <Alert tone="danger">
      {message}
      {fields && fields.length > 0 && (
        <span className="block text-xs opacity-80">Fields: {fields.join(', ')}</span>
      )}
    </Alert>
  );
}
