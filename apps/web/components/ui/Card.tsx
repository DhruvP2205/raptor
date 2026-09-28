import { cn } from '@/lib/cn';

export function Card({
  className,
  raised,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn(
        'rounded border border-line p-5',
        raised ? 'bg-paper-raised' : 'bg-white',
        className,
      )}
      {...rest}
    />
  );
}

export function Container({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8', className)} {...rest} />;
}
