'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { login } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { setUser, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user } = await login({ email, password });
      // Set the login response's user directly — refresh() alone would
      // hit GET /auth/me, which MustResetPasswordGuard blocks for a
      // mustResetPassword account, losing the displayName this page
      // already has in hand.
      setUser(user);
      await refresh();
      router.push(user.mustResetPassword ? '/set-password' : '/');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container className="flex justify-center py-16">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-xl text-ink">Log in</h1>
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
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <ApiErrorAlert error={error} />
          <Button type="submit" loading={loading} fullWidth>
            Log in
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Need an account?{' '}
          <Link href="/signup" className="font-medium text-accent">
            Sign up
          </Link>
        </p>
      </Card>
    </Container>
  );
}
