'use client';

import { cn } from '@/lib/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ManageNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/events/${slug}/manage`, label: 'Overview' },
    { href: `/events/${slug}/manage/tracks-prizes`, label: 'Tracks & prizes' },
    { href: `/events/${slug}/manage/rubric`, label: 'Rubric' },
    { href: `/events/${slug}/manage/judges`, label: 'Judges' },
    { href: `/events/${slug}/manage/verification`, label: 'Verification' },
    { href: `/events/${slug}/manage/assignments`, label: 'Assignments' },
    { href: `/events/${slug}/manage/judging-progress`, label: 'Progress' },
    { href: `/events/${slug}/manage/normalization`, label: 'Normalization' },
    { href: `/events/${slug}/manage/results`, label: 'Results' },
    { href: `/events/${slug}/manage/voting`, label: 'Voting' },
    { href: `/events/${slug}/manage/certificates`, label: 'Certificates' },
    { href: `/events/${slug}/manage/submissions`, label: 'Submissions' },
  ];
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
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
