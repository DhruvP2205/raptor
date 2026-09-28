'use client';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  return (
    <>
      {/* No separate "Browse events" link — the logo already goes to
          "/", which IS the browse/discovery page now (D90). A second
          link to the same destination would just be redundant chrome. */}
      {user?.accountType === 'ORGANIZER' && (
        <Link href="/events/new" onClick={onNavigate} className="text-sm font-medium hover:text-accent">
          Create event
        </Link>
      )}
      {user?.siteAdmin && (
        <Link
          href="/admin/staff-accounts"
          onClick={onNavigate}
          className="text-sm font-medium hover:text-accent"
        >
          Admin
        </Link>
      )}
    </>
  );
}

export function SiteNav() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await logout();
    setOpen(false);
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-header h-14 border-b border-line bg-white">
      <div className="mx-auto flex h-full max-w-page items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="font-display text-xl text-ink">
          Raptor
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <NavLinks />
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {!loading && !user && (
            <>
              <Link href="/login" className="text-sm font-medium hover:text-accent">
                Log in
              </Link>
              <Button size="sm" onClick={() => router.push('/signup')}>
                Sign up
              </Button>
            </>
          )}
          {!loading && user && (
            <>
              <span className="text-sm text-ink-muted">{user.displayName}</span>
              <Button size="sm" variant="secondary" onClick={handleLogout}>
                Log out
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded border border-line-strong md:hidden"
        >
          <span className="relative block h-3.5 w-4">
            <span
              className={`absolute left-0 top-0 h-[1.5px] w-full bg-ink transition-transform ${open ? 'translate-y-[6px] rotate-45' : ''}`}
            />
            <span
              className={`absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-ink transition-opacity ${open ? 'opacity-0' : ''}`}
            />
            <span
              className={`absolute bottom-0 left-0 h-[1.5px] w-full bg-ink transition-transform ${open ? '-translate-y-[6px] -rotate-45' : ''}`}
            />
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-paper px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="h-px bg-line" />
            {!loading && !user && (
              <div className="flex flex-col gap-2">
                <Link href="/login" onClick={() => setOpen(false)} className="text-sm font-medium">
                  Log in
                </Link>
                <Button size="sm" onClick={() => { setOpen(false); router.push('/signup'); }}>
                  Sign up
                </Button>
              </div>
            )}
            {!loading && user && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">{user.displayName}</span>
                <Button size="sm" variant="secondary" onClick={handleLogout}>
                  Log out
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
