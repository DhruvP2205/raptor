import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Card';
import Link from 'next/link';

const TERMINAL_LINES = [
  { prompt: true, text: 'docker compose up' },
  { text: 'raptor-api    | Nest application successfully started' },
  { text: 'raptor-web    | ready on :3000' },
  { text: 'raptor-db     | database system is ready to accept connections' },
  { ok: true, text: 'No external accounts. No hosted services. Just your infra.' },
];

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-line">
        <Container className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-28">
          <div className="flex flex-col gap-6">
            <h1 className="max-w-xl font-display text-4xl text-ink sm:text-5xl">
              Run your hackathon on infrastructure you actually own.
            </h1>
            <p className="max-w-md text-base text-ink-muted">
              Raptor is a submission &amp; judging platform an organizer can
              run for real, from registration through results — no hosted
              third-party service anywhere in the stack.
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
          </div>

          <div className="rounded-md border border-line-strong bg-ink text-white shadow-popover">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            </div>
            <div className="space-y-2 px-4 py-5 font-mono text-xs leading-relaxed sm:text-sm">
              {TERMINAL_LINES.map((line, i) => (
                <p
                  key={i}
                  className={
                    line.prompt
                      ? 'text-white'
                      : line.ok
                        ? 'pt-2 text-white/70'
                        : 'text-white/50'
                  }
                >
                  {line.prompt ? <span className="text-accent">$ </span> : null}
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-16">
        <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-3">
          <div>
            <dt className="font-display text-base text-ink">Register &amp; team up</dt>
            <dd className="mt-2 text-sm text-ink-muted">
              Join solo or form a team with a join code. One participation
              track per event — no duplicate entries.
            </dd>
          </div>
          <div>
            <dt className="font-display text-base text-ink">Submit with confidence</dt>
            <dd className="mt-2 text-sm text-ink-muted">
              Save drafts freely, submit when ready, keep editing until the
              deadline — enforced on the server, not the browser clock.
            </dd>
          </div>
          <div>
            <dt className="font-display text-base text-ink">Built for organizers</dt>
            <dd className="mt-2 text-sm text-ink-muted">
              Configure tracks, prizes, and the full event timeline. Every
              privileged action is written to an audit trail.
            </dd>
          </div>
        </dl>
      </Container>
    </div>
  );
}
