import { cn } from '@/lib/cn';

// Section 1, design/01-auth.md — "a thin bar below the password field,
// live-updating as they type... purely informational, never a
// submit-blocker" (argon2 hashes anything; the backend has no
// minimum-complexity rule). Three segments, filled progressively.
function scorePassword(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12 && /[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score += 1;
  if (password.length >= 12 && /[^a-zA-Z0-9]/.test(password)) score += 1;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const LABELS = ['', 'Weak', 'Okay', 'Strong'];
const COLORS = ['bg-line-strong', 'bg-danger', 'bg-warning', 'bg-success'];

export function PasswordStrengthBar({ password }: { password: string }) {
  const score = scorePassword(password);
  if (password.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            className={cn('h-1 flex-1 rounded-full transition-colors', seg <= score ? COLORS[score] : 'bg-line')}
          />
        ))}
      </div>
      <span className="text-xs text-ink-faint">{LABELS[score]}</span>
    </div>
  );
}
