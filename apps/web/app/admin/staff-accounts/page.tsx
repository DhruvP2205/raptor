'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, createStaffAccount } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/cn';
import { useState } from 'react';

function randomTemporaryPassword(): string {
  return `Temp-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

type Role = 'ORGANIZER' | 'JUDGE';

// docs/design/02-roles-and-membership.md Section 2 — "two large
// radio-style options, not a dropdown, since this choice is permanent
// per backend D10."
function RoleOption({
  role,
  label,
  description,
  selected,
  onSelect,
}: {
  role: Role;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex-1 rounded-lg border p-4 text-left transition-colors',
        selected ? 'border-accent-to bg-accent-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <span className={cn('block text-sm font-medium', selected ? 'text-accent-to' : 'text-ink')}>{label}</span>
      <span className="mt-1 block text-xs text-ink-muted">{description}</span>
    </button>
  );
}

export default function StaffAccountsPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('ORGANIZER');
  const [temporaryPassword, setTemporaryPassword] = useState(randomTemporaryPassword());
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; role: Role; temporaryPassword: string } | null>(null);

  if (!ready) return <PageSpinner />;

  // UX-only gate — SiteAdminGuard independently rejects this route
  // server-side for anyone without the siteAdmin flag.
  if (!user?.siteAdmin) {
    return (
      <Container className="py-16">
        <Alert tone="warning">This page requires platform-admin access.</Alert>
      </Container>
    );
  }

  function handleOpenConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmOpen(true);
  }

  async function handleConfirmCreate() {
    setLoading(true);
    setError(null);
    try {
      await createStaffAccount({ email, displayName, role, temporaryPassword });
      setCreated({ email, role, temporaryPassword });
      showToast(`${role === 'JUDGE' ? 'Judge' : 'Organizer'} account created.`);
      setConfirmOpen(false);
      setEmail('');
      setDisplayName('');
      setTemporaryPassword(randomTemporaryPassword());
    } catch (err) {
      setError(err);
      setConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const emailError =
    error instanceof ApiError && (error.code === 'EMAIL_ALREADY_REGISTERED' || error.code === 'EMAIL_BANNED')
      ? error.message
      : undefined;
  const genericError = error instanceof ApiError && !emailError ? error.message : null;

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-xl text-ink">Create a staff account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Organizer and judge accounts can only be created here — never via self-signup.
        </p>

        {/* The one moment credentials are visible after creation — there's
            no "view password later" anywhere else in the product
            (design doc Section 2, "Success" state). */}
        {created && (
          <div className="mt-4 rounded-lg border border-success-border bg-success-soft p-4">
            <p className="text-sm font-medium text-success">
              Created {created.email} ({created.role === 'JUDGE' ? 'Judge' : 'Organizer'}).
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              Share these credentials directly — they won&apos;t be shown again.
            </p>
            <code className="mt-2 block select-all rounded border border-line bg-white px-2 py-1.5 font-mono text-sm text-ink">
              {created.temporaryPassword}
            </code>
          </div>
        )}

        <form onSubmit={handleOpenConfirm} className="mt-6 flex flex-col gap-4">
          <Field label="Display name" htmlFor="displayName" required>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Field label="Email" htmlFor="email" required error={emailError}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>

          <div>
            <span className="text-sm font-medium text-ink">Role</span>
            <div role="radiogroup" aria-label="Role" className="mt-1.5 flex gap-3">
              <RoleOption
                role="ORGANIZER"
                label="Organizer"
                description="Manages the event end-to-end."
                selected={role === 'ORGANIZER'}
                onSelect={() => setRole('ORGANIZER')}
              />
              <RoleOption
                role="JUDGE"
                label="Judge"
                description="Scores submissions once invited to an event."
                selected={role === 'JUDGE'}
                onSelect={() => setRole('JUDGE')}
              />
            </div>
          </div>

          <Field
            label="Temporary password"
            htmlFor="temporaryPassword"
            required
            hint="Shown once — share it securely."
          >
            <div className="flex gap-2">
              <Input
                id="temporaryPassword"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                required
                minLength={8}
                className="font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTemporaryPassword(randomTemporaryPassword())}
              >
                Generate new
              </Button>
            </div>
          </Field>

          {genericError && <p className="text-xs font-medium text-danger">{genericError}</p>}

          <Button type="submit" fullWidth>
            Create account
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        danger={false}
        title={`Create this ${role === 'JUDGE' ? 'Judge' : 'Organizer'} account?`}
        description={`${displayName} (${email}) — this is permanent and can't be undone from here.`}
        confirmLabel="Create account"
        loading={loading}
        onConfirm={handleConfirmCreate}
        onCancel={() => setConfirmOpen(false)}
      />
    </Container>
  );
}
