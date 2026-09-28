'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { createStaffAccount } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useState } from 'react';

function randomTemporaryPassword(): string {
  return `Temp-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function StaffAccountsPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'ORGANIZER' | 'JUDGE'>('ORGANIZER');
  const [temporaryPassword, setTemporaryPassword] = useState(randomTemporaryPassword());
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createStaffAccount({ email, displayName, role, temporaryPassword });
      setCreated({ email, temporaryPassword });
      setEmail('');
      setDisplayName('');
      setTemporaryPassword(randomTemporaryPassword());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-xl text-ink">Create a staff account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Organizer and judge accounts can only be created here — never via self-signup.
        </p>

        {created && (
          <Alert tone="success" className="mt-4">
            Created <strong>{created.email}</strong>. Temporary password:{' '}
            <code className="font-mono">{created.temporaryPassword}</code> — they must change it on
            first login.
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Display name" htmlFor="displayName" required>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Role" htmlFor="role">
            <Select id="role" value={role} onChange={(e) => setRole(e.target.value as 'ORGANIZER' | 'JUDGE')}>
              <option value="ORGANIZER">Organizer</option>
              <option value="JUDGE">Judge</option>
            </Select>
          </Field>
          <Field label="Temporary password" htmlFor="temporaryPassword" required hint="Shown once — share it securely.">
            <Input
              id="temporaryPassword"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              required
              minLength={8}
              className="font-mono"
            />
          </Field>
          <ApiErrorAlert error={error} />
          <Button type="submit" loading={loading} fullWidth>
            Create account
          </Button>
        </form>
      </Card>
    </Container>
  );
}
