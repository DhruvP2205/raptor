'use client';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  ApiError,
  castVote,
  getEvent,
  getMyVotingEligibility,
  getPowChallenge,
  getPublicShortlist,
  getPublicVotingResults,
  getVotingCaptchaChallenge,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { solveProofOfWork } from '@/lib/vote-pow';
import type {
  PublicEvent,
  PublicShortlist,
  VotingCaptchaChallenge,
  VotingEligibility,
  VotingResultVersion,
} from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// design/11-voting.md Section 2's states table — one specific line per
// condition, never a generic "voting unavailable."
function explanationFor(eligibility: VotingEligibility, shortlist: PublicShortlist): string | null {
  if (!eligibility.eligible) {
    switch (eligibility.reason) {
      case 'NOT_SIGNED_IN':
        return 'Sign in to vote.';
      case 'ACCOUNT_TOO_NEW':
        return 'Your account was created after this event started.';
      case 'NOT_PARTICIPANT':
        return 'Voting in this event is open to participants only.';
      case 'EMAIL_NOT_VERIFIED':
        return 'Voting in this event requires a verified email address.';
      default:
        return null;
    }
  }
  const now = Date.now();
  if (now < new Date(shortlist.votingOpensAt).getTime()) {
    return `Voting opens ${formatTimestamp(shortlist.votingOpensAt)}.`;
  }
  if (now > new Date(shortlist.votingClosesAt).getTime()) {
    return 'Voting has closed for this round.';
  }
  return null;
}

export default function VotingBallotPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [shortlist, setShortlist] = useState<PublicShortlist | null | undefined>(undefined);
  const [eligibility, setEligibility] = useState<VotingEligibility | null>(null);
  const [results, setResults] = useState<VotingResultVersion | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [votingSubmissionId, setVotingSubmissionId] = useState<string | null>(null);
  const [votedSubmissionId, setVotedSubmissionId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<unknown>(null);
  const [captchaState, setCaptchaState] = useState<{ submissionId: string; challenge: VotingCaptchaChallenge } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaBusy, setCaptchaBusy] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  useEffect(() => {
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        const [sl, results] = await Promise.all([getPublicShortlist(e.id), getPublicVotingResults(e.id)]);
        setShortlist(sl);
        setResults(results);
        if (sl) setEligibility(await getMyVotingEligibility(e.id));
      })
      .catch(setError);
  }, [slug, user]);

  async function attemptVote(submissionId: string, captcha?: { challengeId: string; answer: string }) {
    if (!event) return;
    const pow = await getPowChallenge(event.id);
    const nonce = await solveProofOfWork(pow.challenge, pow.difficultyBits);
    return castVote(event.id, {
      submissionId,
      powChallengeId: pow.challengeId,
      powNonce: nonce,
      captchaChallengeId: captcha?.challengeId,
      captchaAnswer: captcha?.answer,
    });
  }

  async function handleVoteClick(submissionId: string) {
    if (!event) return;
    setVotingSubmissionId(submissionId);
    setVoteError(null);
    try {
      await attemptVote(submissionId);
      setVotedSubmissionId(submissionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CAPTCHA_REQUIRED') {
        const challenge = await getVotingCaptchaChallenge(event.id);
        setCaptchaState({ submissionId, challenge });
        setCaptchaAnswer('');
        setCaptchaError(null);
      } else if (err instanceof ApiError && err.code === 'ALREADY_VOTED') {
        // design doc Section 2 — "same confirmation-card treatment as
        // success, not an error."
        setVotedSubmissionId(submissionId);
      } else {
        setVoteError(err);
      }
    } finally {
      setVotingSubmissionId(null);
    }
  }

  async function handleCaptchaSubmit() {
    if (!captchaState || !event) return;
    setCaptchaBusy(true);
    setCaptchaError(null);
    try {
      await attemptVote(captchaState.submissionId, { challengeId: captchaState.challenge.challengeId, answer: captchaAnswer });
      setVotedSubmissionId(captchaState.submissionId);
      setCaptchaState(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_VOTED') {
        setVotedSubmissionId(captchaState.submissionId);
        setCaptchaState(null);
      } else if (err instanceof ApiError && (err.code === 'CAPTCHA_INCORRECT' || err.code === 'CAPTCHA_REQUIRED')) {
        const fresh = await getVotingCaptchaChallenge(event.id);
        setCaptchaState({ submissionId: captchaState.submissionId, challenge: fresh });
        setCaptchaAnswer('');
        setCaptchaError('Incorrect — try again.');
      } else {
        setCaptchaError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCaptchaBusy(false);
    }
  }

  useEffect(() => {
    if (!captchaState) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCaptchaState(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [captchaState]);

  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">This event doesn&apos;t exist, or you don&apos;t have access to it.</Alert>
      </Container>
    );
  }
  if (!event || shortlist === undefined) return <PageSpinner />;

  const resultsLive = results !== null;
  const voteCountBySubmission = new Map((results?.entries ?? []).map((e) => [e.submissionId, e]));

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Audience choice</h1>
      </div>

      {!shortlist ? (
        <Card>
          <p className="text-sm text-ink-muted">The shortlist hasn&apos;t been announced yet.</p>
        </Card>
      ) : shortlist.entries.length === 0 ? (
        <EmptyState title="No submissions on the shortlist." />
      ) : (
        <>
          {!resultsLive && eligibility && (
            <div className="mb-4">
              {(() => {
                const line = explanationFor(eligibility, shortlist);
                if (!line) return null;
                return <Alert tone="neutral">{line}</Alert>;
              })()}
            </div>
          )}
          {resultsLive && (
            <div className="mb-4">
              <Alert tone="success">Voting results are in.</Alert>
            </div>
          )}
          <ApiErrorVoteAlert error={voteError} />

          {(() => {
            const canVote =
              !resultsLive &&
              eligibility?.eligible === true &&
              Date.now() >= new Date(shortlist.votingOpensAt).getTime() &&
              Date.now() <= new Date(shortlist.votingClosesAt).getTime() &&
              votedSubmissionId === null;

            return (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shortlist.entries.map((entry) => {
                  const resultEntry = voteCountBySubmission.get(entry.submissionId);
                  const isCorrected = resultsLive && results?.correctedSubmissionId === entry.submissionId;
                  return (
                    <Card key={entry.id} className="flex flex-col gap-3">
                      <div>
                        <p className="font-display text-base text-ink">{entry.submission?.title || 'Untitled submission'}</p>
                      </div>

                      {resultsLive && resultEntry && !resultEntry.isDisqualified && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-ink-muted">
                            {resultEntry.voteCount} votes ({resultEntry.votePercentage.toFixed(1)}%)
                          </span>
                          {resultEntry.isSharedWin && <Badge tone="accent">Winner</Badge>}
                          {isCorrected && <Badge tone="danger">Corrected</Badge>}
                        </div>
                      )}

                      {!resultsLive && votedSubmissionId === entry.submissionId && (
                        <Badge tone="success">Your vote ✓</Badge>
                      )}

                      {!resultsLive && canVote && votedSubmissionId === null && (
                        <Button
                          size="sm"
                          loading={votingSubmissionId === entry.submissionId}
                          disabled={votingSubmissionId !== null}
                          onClick={() => handleVoteClick(entry.submissionId)}
                        >
                          Vote
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {captchaState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="captcha-dialog-title"
          className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-ink/40 p-4"
        >
          <div className="relative z-modal w-full max-w-sm rounded-lg border border-line bg-white p-5 shadow-overlay">
            <h2 id="captcha-dialog-title" className="font-display text-lg text-ink">
              Confirm you&apos;re human
            </h2>
            <p className="mt-2 text-sm text-ink-muted">Type the characters shown below to finish casting your vote.</p>
            <div
              className="mt-3 flex items-center justify-center rounded border border-line"
              // Server-generated inline SVG (no external image service) —
              // trusted the same way descriptionHtml is elsewhere in this
              // app, since this content is entirely backend-generated.
              dangerouslySetInnerHTML={{ __html: captchaState.challenge.svg }}
            />
            <input
              autoFocus
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCaptchaSubmit()}
              className="mt-3 w-full rounded border border-line bg-white px-3 py-2 text-center font-mono text-sm uppercase tracking-widest text-ink"
              placeholder="CODE"
            />
            {captchaError && <p className="mt-2 text-xs font-medium text-danger">{captchaError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCaptchaState(null)} disabled={captchaBusy}>
                Cancel
              </Button>
              <Button size="sm" loading={captchaBusy} disabled={!captchaAnswer.trim()} onClick={handleCaptchaSubmit}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}

function ApiErrorVoteAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mb-4">
      <Alert tone="danger">{message}</Alert>
    </div>
  );
}
