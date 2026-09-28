'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { signup } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signup({ email, password, displayName });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Container className="flex justify-center py-16">
        <Card className="w-full max-w-sm text-center">
          <h1 className="font-display text-xl text-ink">Check your email</h1>
          <p className="mt-2 text-sm text-ink-muted">
            We sent a verification link to <strong>{email}</strong>. Verify
            your address before logging in.
          </p>
          <Link href="/verify-email" className="mt-4 inline-block text-sm font-medium text-accent">
            Enter a verification code instead →
          </Link>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-xl text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Participant accounts sign up here. Organizer/judge accounts are
          created by a site admin.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Display name" htmlFor="displayName" required>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={100}
            />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="password" required hint="At least 8 characters.">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <ApiErrorAlert error={error} />
          <Button type="submit" loading={loading} fullWidth>
            Sign up
          </Button>
        </form>
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
