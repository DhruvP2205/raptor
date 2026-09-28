import { Alert } from '@/components/ui/Alert';

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  trackIds: 'Track selection',
};

// Renders the exact `fields` array the backend's MISSING_REQUIRED_FIELDS
// error returns (apps/api/src/submissions/submissions.service.ts, submit())
// — never a generic "please fill out the form."
export function MissingFieldsAlert({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <Alert tone="warning">
      Can&apos;t submit yet — missing:{' '}
      <strong>{fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}</strong>
    </Alert>
  );
}
