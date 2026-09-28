'use client';

import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ErrorBlock } from '@/components/ui/ErrorBlock';
import { Field, PasswordInput } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, setPassword } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { safeReturnPath } from '@/lib/safe-return-path';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

// design/01-auth.md Section 4. Reached only when mustResetPassword is
// true — deliberately inescapable (backend D61: no other route is
// reachable in this state), so there's no nav here at all besides the
// plain "Log out" link.
function SetPasswordForm() {
  // Deliberately not useRequireAuth() — that hook redirects a
  // mustResetPassword session TO this very page, which would be a
  // no-op loop that never renders. This page is the one place that
  // state is allowed to land: redirect to /login only if there's no
  // session at all, and treat "restricted" as ready, not "logged out."
  const { user, mustResetPassword, loading, refresh, logout } = useAuth();
  const router = useRouter();
  // Forwarded from /login (Module 2's invitation-link flow — see
  // login/page.tsx) so a forced-reset account still lands back where it
  // was headed, not the homepage, once the reset is done.
  const next = safeReturnPath(useSearchParams().get('next'));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [serverError, setServerError] = useState<unknown>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set right before handleSubmit's own navigation — refresh() flips
  // mustResetPassword to false the instant the reset succeeds, which
  // re-runs this effect *before* handleSubmit's router.push(next) has
  // finished navigating away. Without this guard the effect's
  // router.replace('/') below wins the race and next gets silently
  // dropped in favor of the homepage (caught via the judge-invitation
  // flow: next pointed at the invitation link, but landed on '/' instead).
  const justReset = useRef(false);

  useEffect(() => {
    if (loading || mustResetPassword || justReset.current) return;
    // Reachable only via the forced mustResetPassword state (Section 4).
    // No session at all -> log in first; a normal session that already
    // has mustResetPassword=false has nothing to do here -> send it home
    // instead of rendering the reset form for an account that isn't
    // actually restricted.
    router.replace(user ? '/' : '/login');
  }, [loading, user, mustResetPassword, router]);

  if (loading || !mustResetPassword) return <PageSpinner />;

  const mismatch = confirmTouched && confirmPassword.length > 0 && confirmPassword !== newPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmPassword !== newPassword) {
      setConfirmTouched(true);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    setNetworkError(null);
    try {
      await setPassword(newPassword);
      justReset.current = true;
      await refresh();
      router.push(next ?? '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err);
      } else {
        setNetworkError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-xl text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {user?.displayName ? `${user.displayName}, an` : 'An'} admin created this account for
          you. Set a new password to continue — every other page is unavailable until you do.
        </p>

        {networkError ? (
          <div className="mt-6">
            <ErrorBlock message={networkError} onRetry={() => setNetworkError(null)} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters.">
              <PasswordInput
                id="newPassword"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field
              label="Confirm password"
              htmlFor="confirmPassword"
              required
              error={mismatch ? "Passwords don't match." : undefined}
            >
              <PasswordInput
                id="confirmPassword"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmTouched(true)}
                required
              />
            </Field>
            {serverError instanceof ApiError && (
              <p role="alert" className="text-xs font-medium text-danger">
                {serverError.message}
              </p>
            )}
            <Button type="submit" loading={submitting} fullWidth>
              Set password and continue
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => void logout().then(() => router.push('/login'))}
          className="mt-4 block w-full text-center text-sm text-ink-muted underline"
        >
          Log out
        </button>
      </Card>
    </Container>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <SetPasswordForm />
    </Suspense>
  );
}
