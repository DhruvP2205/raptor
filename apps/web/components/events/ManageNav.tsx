'use client';

import { cn } from '@/lib/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ManageNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/events/${slug}/manage`, label: 'Overview' },
    { href: `/events/${slug}/manage/tracks-prizes`, label: 'Tracks & prizes' },
    { href: `/events/${slug}/manage/submissions`, label: 'Submissions' },
  ];
  return (
    <nav className="mb-6 flex gap-1 border-b border-line">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              active ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
