import { Button } from './Button';

// design/01-auth.md references "the same error-block pattern as the
// Events list doc (Section 2.5 there)" for server/network failures —
// that doc (and any prior implementation of the pattern) doesn't
// actually exist anywhere in this repo. Built fresh here as the
// smallest reasonable reading of the phrase it does give us ("heading
// + specific cause + Retry, non-destructive to whatever was typed"),
// flagged as an inference rather than a redraw of something that
// already existed. Every later module's design doc should reference
// *this* component by name, not the missing one.
export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-line-strong bg-paper-raised px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink">Something went wrong</p>
      <p className="text-xs text-ink-muted">{message}</p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
