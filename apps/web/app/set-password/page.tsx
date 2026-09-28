'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { setPassword } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SetPasswordPage() {
  // Deliberately not useRequireAuth() — that hook redirects a
  // mustResetPassword session TO this very page, which would be a
  // no-op loop that never renders. This page is the one place that
  // state is allowed to land: redirect to /login only if there's no
  // session at all, and treat "restricted" as ready, not "logged out."
  const { user, mustResetPassword, loading, refresh } = useAuth();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user && !mustResetPassword) {
      router.replace('/login');
    }
  }, [loading, user, mustResetPassword, router]);

  if (loading || (!user && !mustResetPassword)) return <PageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await setPassword(newPassword);
      await refresh();
      router.push('/');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-xl text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {user?.displayName ? `${user.displayName}, this` : 'This'} account was created with a
          temporary password. Choose your own before continuing — every other page is unavailable
          until you do.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters.">
            <Input
              id="newPassword"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>
          <ApiErrorAlert error={error} />
          <Button type="submit" loading={submitting} fullWidth>
            Set password
          </Button>
        </form>
      </Card>
    </Container>
  );
}
