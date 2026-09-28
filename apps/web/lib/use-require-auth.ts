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
      // Preserves the return path (docs/design/02-roles-and-membership.md
      // Section 4 — a judge invitation link opened while logged out
      // needs to land back on that same link after login, not the
      // homepage). Read directly from window.location rather than
      // useSearchParams()/usePathname() so this hook doesn't force every
      // one of its many call sites into a <Suspense> boundary just for
      // this redirect path — Login itself decides whether `next` is
      // safe to use.
      const returnTo = encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      );
      router.replace(`/login?next=${returnTo}`);
    } else if (mustResetPassword) {
      router.replace('/set-password');
    }
  }, [loading, user, mustResetPassword, router]);

  return { ready: !loading && !!user && !mustResetPassword };
}
