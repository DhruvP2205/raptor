import { cn } from '@/lib/cn';

const baseInputClasses =
  'w-full rounded border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint ' +
  'focus:border-accent focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent/40 ' +
  'disabled:bg-line/30 disabled:text-ink-faint';

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseInputClasses, className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseInputClasses, 'min-h-[8rem] resize-y', className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseInputClasses, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
