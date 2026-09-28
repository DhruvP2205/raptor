'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import {
  ApiError,
  enableCertificates,
  getCertificateTemplate,
  getEvent,
  listResultVersions,
  manualIssueCertificate,
  upsertCertificateTemplate,
} from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { CertificateRole, CertificateTemplate, PublicEvent } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const PREVIEW_VALUES: Record<string, string> = {
  recipientName: 'Jordan Rivera',
  eventName: 'Sample Event',
  role: 'WINNER',
  projectName: 'Sample Project',
  teamName: 'Sample Team',
  issuedDate: new Date().toISOString().slice(0, 10),
  certificateId: 'sample-certificate-id',
  verifyUrl: 'https://example.com/certificates/sample-certificate-id',
};

function substitutePlaceholders(svg: string, values: Record<string, string>): string {
  let result = svg;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export default function OrganizerCertificatesPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const { showToast } = useToast();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [resultsLive, setResultsLive] = useState(false);

  const [enableOpen, setEnableOpen] = useState(false);
  const [enableBusy, setEnableBusy] = useState(false);
  const [enableError, setEnableError] = useState<unknown>(null);

  const [template, setTemplate] = useState<CertificateTemplate | null>(null);
  const [draftSvg, setDraftSvg] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [issueUserId, setIssueUserId] = useState('');
  const [issueRole, setIssueRole] = useState<CertificateRole>('PARTICIPANT');
  const [issueReason, setIssueReason] = useState('');
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState<unknown>(null);
  const [issueSuccess, setIssueSuccess] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        const versions = await listResultVersions(e.id).catch(() => []);
        setResultsLive(versions.some((v) => v.status === 'LIVE'));
        return getCertificateTemplate(e.id).catch((err) => {
          if (err instanceof ApiError && err.code === 'CERTIFICATE_TEMPLATE_NOT_FOUND') return null;
          throw err;
        });
      })
      .then((t) => {
        setTemplate(t);
        if (t) setDraftSvg(t.svgMarkup);
      })
      .catch(setError);
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event) return <PageSpinner />;

  function loadFile(file: File) {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
      setUploadError("This SVG couldn't be used as a certificate template. Check that it doesn't include scripts or embedded HTML, then try again.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      if (!text.includes('<svg')) {
        setUploadError("This SVG couldn't be used as a certificate template. Check that it doesn't include scripts or embedded HTML, then try again.");
        return;
      }
      setDraftSvg(text);
    };
    reader.readAsText(file);
  }

  async function handleEnable() {
    setEnableBusy(true);
    setEnableError(null);
    try {
      const result = await enableCertificates(event!.id);
      setEvent((e) => (e ? { ...e, certificatesEnabled: result.certificatesEnabled, certificatesEnabledAt: result.certificatesEnabledAt } : e));
      setEnableOpen(false);
      showToast('Certificates enabled.');
    } catch (err) {
      setEnableError(err);
    } finally {
      setEnableBusy(false);
    }
  }

  async function handleSaveTemplate() {
    setSaveBusy(true);
    setSaveError(null);
    try {
      const saved = await upsertCertificateTemplate(event!.id, draftSvg);
      setTemplate(saved);
      showToast('Template saved.');
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleManualIssue() {
    setIssueBusy(true);
    setIssueError(null);
    setIssueSuccess(false);
    try {
      await manualIssueCertificate(event!.id, { userId: issueUserId.trim(), role: issueRole, reason: issueReason.trim() });
      setIssueSuccess(true);
      setIssueUserId('');
      setIssueReason('');
    } catch (err) {
      setIssueError(err);
    } finally {
      setIssueBusy(false);
    }
  }

  const previewSvg = draftSvg ? substitutePlaceholders(draftSvg, PREVIEW_VALUES) : null;

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — certificates</h1>
      <p className="mb-6 text-sm text-ink-muted">Template, the enable switch, and manual overrides.</p>

      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="font-display text-lg text-ink">Enable certificates</h2>
          {event.certificatesEnabled ? (
            <p className="mt-2 text-sm text-ink-muted">
              Enabled{event.certificatesEnabledAt ? ` on ${new Date(event.certificatesEnabledAt).toLocaleString()}` : ''}.
            </p>
          ) : resultsLive ? (
            <>
              <ApiErrorAlert error={enableError} />
              <Button size="sm" className="mt-2" onClick={() => setEnableOpen(true)}>
                Enable certificates
              </Button>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Certificates can be enabled once results are published.</p>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg text-ink">Certificate template</h2>
          <p className="mt-1 text-xs text-ink-muted">
            SVG only. Placeholder tokens: <code>{'{{recipientName}}'}</code>, <code>{'{{eventName}}'}</code>,{' '}
            <code>{'{{role}}'}</code>, <code>{'{{projectName}}'}</code>, <code>{'{{teamName}}'}</code>,{' '}
            <code>{'{{issuedDate}}'}</code>, <code>{'{{certificateId}}'}</code>, <code>{'{{verifyUrl}}'}</code>.
          </p>

          {template && (
            <p className="mt-2 text-xs text-ink-muted">
              Already-issued certificates keep their original design. Only certificates issued from now on use this new
              one.
            </p>
          )}

          <div
            className={`mt-3 flex flex-col items-center justify-center gap-2 rounded border border-dashed p-6 text-center text-sm ${
              dragOver ? 'border-accent bg-accent-soft' : 'border-line-strong'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) loadFile(file);
            }}
          >
            <p className="text-ink-muted">Drag and drop an SVG file here, or</p>
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFile(file);
              }}
            />
          </div>

          {uploadError && (
            <div className="mt-3">
              <Alert tone="danger">{uploadError}</Alert>
            </div>
          )}

          {previewSvg && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">Preview</h3>
              {/* Sandboxed with no permissions at all — this is an
                  organizer's own upload, not yet sanitized (that only
                  happens server-side on save), so it must never be
                  rendered as trusted content even in the organizer's
                  own browser. */}
              <iframe
                title="Certificate preview"
                sandbox=""
                srcDoc={`<html><body style="margin:0">${previewSvg}</body></html>`}
                className="h-64 w-full rounded border border-line bg-white"
              />
              <ApiErrorAlert error={saveError} />
              <Button size="sm" className="mt-3" loading={saveBusy} onClick={handleSaveTemplate}>
                Save template
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg text-ink">Manual issue (organizer override)</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Bypasses the disqualification exclusion — for a specific case an organizer judges appropriate.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="User ID" htmlFor="issue-user-id" required>
              <Input id="issue-user-id" value={issueUserId} onChange={(e) => setIssueUserId(e.target.value)} />
            </Field>
            <Field label="Role" htmlFor="issue-role" required>
              <Select id="issue-role" value={issueRole} onChange={(e) => setIssueRole(e.target.value as CertificateRole)}>
                <option value="PARTICIPANT">Participant</option>
                <option value="JUDGE">Judge</option>
                <option value="WINNER">Winner</option>
                <option value="SPECIAL_AWARD_WINNER">Special Award Winner</option>
              </Select>
            </Field>
            <Field label="Reason" htmlFor="issue-reason" required>
              <Textarea id="issue-reason" minRows={2} value={issueReason} onChange={(e) => setIssueReason(e.target.value)} />
            </Field>
            <ApiErrorAlert error={issueError} />
            {issueSuccess && <Alert tone="success">Certificate issued.</Alert>}
            <div>
              <Button
                size="sm"
                loading={issueBusy}
                disabled={!issueUserId.trim() || !issueReason.trim()}
                onClick={handleManualIssue}
              >
                Issue certificate
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={enableOpen}
        danger={false}
        title="Enable certificates?"
        description="Every eligible participant and judge will be able to generate their certificate from now on. This can't be turned back off."
        confirmLabel="Enable certificates"
        loading={enableBusy}
        onConfirm={handleEnable}
        onCancel={() => setEnableOpen(false)}
      />
    </Container>
  );
}
