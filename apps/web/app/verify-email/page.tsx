'use client';

import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, resendVerification, verifyEmail } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

const RESEND_COOLDOWN_SECONDS = 30;

// design/01-auth.md Section 3. Two sub-screens sharing one route, per
// the module map ("Verify email" is one screen with a pending mode and
// a landing mode) — token in the URL means "landing" (3.2), email
// -only means "pending" (3.1, just after signup).
function VerifyEmailScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const token = params.get('token');
  const emailFromQuery = params.get('email') ?? '';

  if (token) {
    return <LandingMode token={token} isLoggedIn={!authLoading && !!user} loggedInEmail={user?.email} />;
  }
  return <PendingMode initialEmail={emailFromQuery} onToast={showToast} router={router} />;
}

// --- 3.2 Verification landing (link from the email) ---

function LandingMode({
  token,
  isLoggedIn,
  loggedInEmail,
}: {
  token: string;
  isLoggedIn: boolean;
  loggedInEmail?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'done' | 'failed'>('verifying');
  const [failureReason, setFailureReason] = useState<'expired' | 'invalid' | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    verifyEmail(token)
      .then(() => setStatus('done'))
      .catch((err) => {
        setStatus('failed');
        setFailureReason(err instanceof ApiError && err.code === 'TOKEN_EXPIRED' ? 'expired' : 'invalid');
      });
  }, [token]);

  if (status === 'verifying') {
    return (
      <Card className="w-full max-w-sm text-center">
        <Spinner className="mx-auto" />
        <p className="mt-3 text-sm text-ink-muted">Verifying your email…</p>
      </Card>
    );
  }

  if (status === 'done') {
    // Not logged in (e.g. the link was opened in a different
    // browser/session than the one that signed up) — route to login
    // with the success already communicated there, rather than a dead
    // -end "you're verified but not logged in" screen.
    if (!isLoggedIn) {
      router.replace('/login?verified=1');
      return (
        <Card className="w-full max-w-sm text-center">
          <Spinner className="mx-auto" />
        </Card>
      );
    }
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl text-ink">Email verified</h1>
        <p className="mt-2 text-sm text-ink-muted">You're all set.</p>
        <Link href="/" className="mt-4 inline-block">
          <Button type="button">Continue to Raptor</Button>
        </Link>
      </Card>
    );
  }

  // Expired/invalid — from the person's perspective these read the
  // same ("this link doesn't work"), so one unified message covers
  // both (Section 3.2's own note). Resending requires knowing which
  // account to resend for, so an unauthenticated visitor is routed to
  // log in first, with an explanatory note.
  if (!isLoggedIn) {
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl text-ink">This link has expired or is invalid</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Log in first so we know which account to resend a new link for.
        </p>
        <Link href="/login" className="mt-4 inline-block">
          <Button type="button">Log in</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm text-center">
      <h1 className="font-display text-xl text-ink">This link has expired or is invalid</h1>
      <ResendForm initialEmail={loggedInEmail ?? ''} emailLocked />
    </Card>
  );
}

// --- 3.1 Pending screen (shown right after signup) ---

function PendingMode({
  initialEmail,
  onToast,
  router,
}: {
  initialEmail: string;
  onToast: (message: string) => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Card className="w-full max-w-sm text-center">
      <h1 className="font-display text-xl text-ink">Check your email</h1>
      {initialEmail && (
        <p className="mt-2 text-sm text-ink-muted">
          We sent a verification link to <strong className="text-ink">{initialEmail}</strong>.
        </p>
      )}
      <div className="mt-5 text-left">
        <ResendForm initialEmail={initialEmail} emailLocked={false} onSent={() => onToast('Verification email sent.')} />
      </div>
      <p className="mt-4 text-xs text-ink-faint">
        Already verified?{' '}
        <button type="button" className="font-medium text-accent" onClick={() => router.push('/login')}>
          Log in
        </button>
      </p>
    </Card>
  );
}

// Shared by both modes — the actual resend action, with the loading
// state, cooldown, and toast-vs-inline-failure split (Section 0/3.1).
function ResendForm({
  initialEmail,
  emailLocked,
  onSent,
}: {
  initialEmail: string;
  emailLocked: boolean;
  onSent?: () => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setFailed(false);
    try {
      await resendVerification(email);
      showToast('Verification email sent.');
      onSent?.();
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      // Toasts are success-only (Section 0) — a failed resend gets an
      // inline message instead, not a toast.
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleResend} className="flex flex-col gap-3">
      {!emailLocked && (
        <Field label="Email" htmlFor="resend-email">
          <Input id="resend-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
      )}
      <Button type="submit" variant="secondary" fullWidth loading={sending} disabled={cooldown > 0 || !email}>
        {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
      </Button>
      {failed && <p className="text-xs font-medium text-danger">Couldn't resend — try again.</p>}
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={null}>
        <VerifyEmailScreen />
      </Suspense>
    </Container>
  );
}
