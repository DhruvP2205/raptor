'use client';

import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ErrorBlock } from '@/components/ui/ErrorBlock';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { PasswordStrengthBar } from '@/components/ui/PasswordStrengthBar';
import { ApiError, signup } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// design/01-auth.md Section 1. Field order matches the backend's own
// field order (email, password, display name) — see the design doc's
// "Structure" note.
export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<unknown>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  function validateEmailOnBlur() {
    setEmailTouched(true);
    if (email && !EMAIL_PATTERN.test(email)) {
      setEmailError('Enter a valid email address.');
    } else {
      setEmailError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email)) {
      setEmailTouched(true);
      setEmailError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    setServerError(null);
    setNetworkError(null);
    try {
      await signup({ email, password, displayName });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
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

  // Server-side validation errors map onto the same inline-error slot
  // as client-side ones (Section 0) — both surface under the email
  // field here, since both errors the backend can return are about
  // the email specifically.
  const serverEmailError =
    serverError instanceof ApiError
      ? serverError.code === 'EMAIL_ALREADY_REGISTERED'
        ? 'An account with this email already exists.'
        : serverError.code === 'EMAIL_BANNED'
          ? "This email can't be used to create an account. Contact an admin if you think this is a mistake."
          : null
      : null;
  const genericServerError =
    serverError instanceof ApiError && !serverEmailError ? serverError.message : null;

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-xl text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Participant accounts sign up here. Organizer/judge accounts are
          created by a site admin.
        </p>

        {networkError ? (
          <div className="mt-6">
            <ErrorBlock message={networkError} onRetry={() => setNetworkError(null)} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Field
              label="Email"
              htmlFor="email"
              required
              error={emailTouched && emailError ? emailError : serverEmailError ?? undefined}
            >
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setServerError(null);
                }}
                onBlur={validateEmailOnBlur}
                required
              />
            </Field>
            {serverEmailError === 'An account with this email already exists.' && (
              <p className="-mt-2 text-xs">
                <Link href="/login" className="font-medium text-accent">
                  Log in instead
                </Link>
              </p>
            )}

            <Field label="Password" htmlFor="password" required hint="At least 8 characters.">
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </Field>
            <PasswordStrengthBar password={password} />

            <Field label="Display name" htmlFor="displayName" required>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
              />
            </Field>

            {genericServerError && (
              <p className="text-xs font-medium text-danger">{genericServerError}</p>
            )}

            <Button type="submit" loading={loading} fullWidth>
              Create account
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent">
            Log in
          </Link>
        </p>
      </Card>
    </Container>
  );
}
