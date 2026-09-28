'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { resendVerification, verifyEmail } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function VerifyEmailForm() {
  const params = useSearchParams();
  const tokenFromLink = params.get('token') ?? '';

  const [token, setToken] = useState(tokenFromLink);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'done'>('idle');
  const [error, setError] = useState<unknown>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function runVerify(value: string) {
    setStatus('verifying');
    setError(null);
    try {
      await verifyEmail(value);
      setStatus('done');
    } catch (err) {
      setError(err);
      setStatus('idle');
    }
  }

  useEffect(() => {
    if (tokenFromLink) void runVerify(tokenFromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromLink]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResendMessage(null);
    try {
      await resendVerification(email);
      setResendMessage('If that address needs verifying, a new link is on its way.');
    } catch (err) {
      setError(err);
    }
  }

  if (status === 'done') {
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl text-ink">Email verified</h1>
        <p className="mt-2 text-sm text-ink-muted">
          You can log in now.
        </p>
        <a href="/login" className="mt-4 inline-block text-sm font-medium text-accent">
          Go to log in →
        </a>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="font-display text-xl text-ink">Verify your email</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Paste the token from your verification email, or request a new one.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runVerify(token);
        }}
        className="mt-5 flex flex-col gap-3"
      >
        <Field label="Verification token" htmlFor="token">
          <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
        <ApiErrorAlert error={error} />
        <Button type="submit" loading={status === 'verifying'} fullWidth>
          Verify
        </Button>
      </form>

      <div className="my-5 h-px bg-line" />

      <form onSubmit={handleResend} className="flex flex-col gap-3">
        <Field label="Resend to email" htmlFor="resend-email">
          <Input
            id="resend-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {resendMessage && <Alert tone="success">{resendMessage}</Alert>}
        <Button type="submit" variant="secondary" fullWidth>
          Resend verification email
        </Button>
      </form>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </Container>
  );
}
