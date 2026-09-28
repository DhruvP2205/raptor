import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-line bg-paper-raised">
        <Container className="flex flex-col gap-6 py-16 sm:py-24">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            Open &amp; self-hostable
          </p>
          <h1 className="max-w-2xl font-display text-4xl leading-tight text-ink sm:text-5xl">
            Run your hackathon on infrastructure you actually own.
          </h1>
          <p className="max-w-xl text-base text-ink-muted sm:text-lg">
            Raptor is a submission &amp; judging platform an organizer can run
            for real, from registration through results — no hosted
            third-party service required anywhere in the stack.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/events">
              <Button size="md">Browse events</Button>
            </Link>
            <Link href="/signup">
              <Button size="md" variant="secondary">
                Create an account
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      <Container className="grid gap-6 py-14 sm:grid-cols-3">
        <Card>
          <h2 className="font-display text-lg text-ink">Register &amp; team up</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Join solo or form a team with a simple join code. One
            participation track per event — no confusing double entries.
          </p>
        </Card>
        <Card>
          <h2 className="font-display text-lg text-ink">Submit with confidence</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Save drafts freely, submit when ready, and keep editing right
            up to the deadline — every deadline enforced on the server,
            not your browser clock.
          </p>
        </Card>
        <Card>
          <h2 className="font-display text-lg text-ink">Built for organizers</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Configure tracks, prizes, and the full event timeline, with
            every privileged action logged to an audit trail.
          </p>
        </Card>
      </Container>
    </div>
  );
}
