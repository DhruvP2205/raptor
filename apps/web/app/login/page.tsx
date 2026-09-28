'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ErrorBlock } from '@/components/ui/ErrorBlock';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { ApiError, login } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { safeReturnPath } from '@/lib/safe-return-path';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justVerified = params.get('verified') === '1';
  const next = safeReturnPath(params.get('next'));
  const { setUser, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverError, setServerError] = useState<unknown>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setServerError(null);
    setNetworkError(null);
    try {
      const { user } = await login({ email, password });
      // Set the login response's user directly — refresh() alone would
      // hit GET /auth/me, which MustResetPasswordGuard blocks for a
      // mustResetPassword account, losing the displayName this page
      // already has in hand.
      setUser(user);
      await refresh();
      // A forced-reset account (e.g. a judge's first login off an
      // invitation link) needs `next` to survive the detour through
      // /set-password too, or the invitation link's destination is lost
      // the moment a password reset is also required.
      const setPasswordUrl = next ? `/set-password?next=${encodeURIComponent(next)}` : '/set-password';
      router.push(user.mustResetPassword ? setPasswordUrl : (next ?? '/'));
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err);
      } else {
        setNetworkError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="font-display text-xl text-ink">Log in</h1>

      {justVerified && (
        <Alert tone="success" className="mt-4">
          Email verified — log in to continue.
        </Alert>
      )}

      {networkError ? (
        <div className="mt-6">
          <ErrorBlock message={networkError} onRetry={() => setNetworkError(null)} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {/* Deliberately generic, never distinguishes which field was
              wrong — an account-enumeration leak the backend doesn't
              back up either (Section 2's own note). */}
          {serverError instanceof ApiError && (
            <p role="alert" className="text-xs font-medium text-danger">
              {serverError.message}
            </p>
          )}
          <Button type="submit" loading={loading} fullWidth>
            Log in
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-ink-muted">
        New here?{' '}
        <Link href="/signup" className="font-medium text-accent">
          Create an account
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </Container>
  );
}
