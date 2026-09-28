'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { getGlobalRankingDrilldown, getUserCertificateGallery } from '@/lib/api';
import type { GalleryCertificate, GlobalRankingDrilldown } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  JUDGE: 'Judge',
  WINNER: 'Winner',
  SPECIAL_AWARD_WINNER: 'Special Award Winner',
};

const AWARD_KIND_LABEL: Record<string, string> = {
  PODIUM_FIRST: '1st place',
  PODIUM_SECOND: '2nd place',
  PODIUM_THIRD: '3rd place',
  SPECIAL_AWARD: 'Special award',
  AUDIENCE_CHOICE: 'Audience choice',
};

// docs/design/14-global-ranking.md Section 3 — this is the general
// profile shell picking up Module 12's own flagged note: certificate
// gallery and ranking drill-down share one page rather than separate
// routes, since both are "public facts about this person." The
// drilldown call is what decides page-level existence (404 for a bad
// ID) — a real account with zero ranking data still returns a full
// shape (rank: null, awards: []), never confused with "doesn't exist."
export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [drilldown, setDrilldown] = useState<GlobalRankingDrilldown | null>(null);
  const [certificates, setCertificates] = useState<GalleryCertificate[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getGlobalRankingDrilldown(id)
      .then(setDrilldown)
      .catch(() => setNotFound(true));
    // Independent of the drilldown call — each section handles its own
    // empty state without blocking the other from rendering.
    getUserCertificateGallery(id)
      .then(setCertificates)
      .catch(() => setCertificates([]));
  }, [id]);

  if (notFound) {
    return (
      <Container className="py-16">
        <p className="text-sm text-ink-muted">Not found.</p>
      </Container>
    );
  }
  if (!drilldown) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-8 flex items-center gap-4">
        <Avatar name={drilldown.displayName} id={drilldown.userId} size="large" />
        <div>
          <h1 className="font-display text-2xl text-ink">{drilldown.displayName}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-muted">
            <span>{drilldown.points} points</span>
            <span>{drilldown.eventsCount} events</span>
            {drilldown.firstsCount > 0 && <span>1st ×{drilldown.firstsCount}</span>}
            {drilldown.secondsCount > 0 && <span>2nd ×{drilldown.secondsCount}</span>}
            {drilldown.thirdsCount > 0 && <span>3rd ×{drilldown.thirdsCount}</span>}
            {drilldown.rank !== null && (
              <span>
                Rank {drilldown.isTied ? `=${drilldown.rank}` : drilldown.rank}
              </span>
            )}
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg text-ink">Awards</h2>
        {drilldown.awards.length === 0 ? (
          <EmptyState title="No awards yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {drilldown.awards.map((award, i) => (
              <li key={i} className="rounded border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/events/${award.event.slug}`} className="font-medium text-ink hover:text-accent">
                    {award.event.name}
                  </Link>
                  <Badge tone="accent">{AWARD_KIND_LABEL[award.awardKind] ?? award.awardKind}</Badge>
                </div>
                <p className="mt-1 text-ink-muted">
                  {award.label}
                  {award.projectName && ` — ${award.projectName}`}
                  {award.teamName && ` (${award.teamName})`}
                </p>
                <p className="mt-1 font-mono text-xs text-ink-faint">
                  {award.pointsAwarded} points
                  {award.prizeUsd ? ` · $${award.prizeUsd}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg text-ink">Certificates</h2>
        {certificates === null ? (
          <PageSpinner />
        ) : certificates.length === 0 ? (
          <EmptyState title="No certificates yet." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((c) => (
              <Link key={c.certificateId} href={`/certificates/${c.certificateId}`}>
                <Card className="flex h-full flex-col gap-2 transition-colors hover:border-accent-to">
                  <p className="font-display text-base text-ink">{c.eventName}</p>
                  <Badge tone="accent">{ROLE_LABEL[c.role] ?? c.role}</Badge>
                  {c.projectName && <p className="text-sm text-ink-muted">{c.projectName}</p>}
                  <p className="mt-auto text-xs text-ink-faint">{c.issuedDate}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* design/14-global-ranking.md Section 5.2 — no in-app claim flow
          exists; this is deliberately just informational text. */}
      <p className="mt-8 text-xs text-ink-faint">
        Don&apos;t see one of your past projects? Contact an admin to have it linked to your account.
      </p>
    </Container>
  );
}
