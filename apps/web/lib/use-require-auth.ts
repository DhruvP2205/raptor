'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './auth-context';

// UX convenience only — redirects an obviously-unauthenticated visitor
// away from a page that needs a session, or a restricted (mustResetPassword)
// one to the one place it's allowed to go. This is NOT authorization:
// every real check happens server-side (SessionAuthGuard,
// MustResetPasswordGuard, EventRoleGuard, SiteAdminGuard, or a
// service-level ownership check) per CLAUDE.md principle 1. A user who
// bypasses this redirect gets nothing more than a page that fails to
// load data — the API still rejects them.
export function useRequireAuth(): { ready: boolean } {
  const { user, mustResetPassword, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user && !mustResetPassword) {
      router.replace('/login');
    } else if (mustResetPassword) {
      router.replace('/set-password');
    }
  }, [loading, user, mustResetPassword, router]);

  return { ready: !loading && !!user && !mustResetPassword };
}
