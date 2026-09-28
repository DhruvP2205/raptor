import { cn } from '@/lib/cn';

export function Card({
  className,
  raised,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line p-4', // DESIGN-SYSTEM.md 4: radius-lg-ish card, 16px padding
        raised ? 'bg-paper-raised' : 'bg-white',
        className,
      )}
      {...rest}
    />
  );
}

// DESIGN-SYSTEM.md 4 — page max-width 1200px, 24px desktop / 16px mobile
// horizontal padding.
export function Container({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-page px-4 sm:px-6', className)} {...rest} />;
}
