'use client';

import { ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { resolveMediaUrl, uploadEventPoster } from '@/lib/api';
import { useRef, useState } from 'react';

// POST /events/:eventId/poster re-encodes to JPEG server-side (magic
// -byte validated, EXIF stripped) — this is just the picker + preview;
// the server is the actual source of truth on format/size/dimensions
// (apps/api/src/uploads/upload-limits.ts: 5MB, max 1920x1080).
export function PosterUpload({
  eventId,
  posterUrl,
  onUploaded,
}: {
  eventId: string;
  posterUrl: string | null;
  onUploaded: (posterUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(resolveMediaUrl(posterUrl));

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const { posterUrl: uploaded } = await uploadEventPoster(eventId, file);
      if (uploaded) onUploaded(uploaded);
    } catch (err) {
      setError(err);
      setPreviewUrl(resolveMediaUrl(posterUrl));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[16/9] w-full max-w-sm overflow-hidden rounded border border-line bg-paper-raised">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-faint">
            No poster yet
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
        id="poster-file-input"
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={loading}
          onClick={() => inputRef.current?.click()}
        >
          {posterUrl ? 'Replace poster' : 'Upload poster'}
        </Button>
        <span className="text-xs text-ink-faint">JPEG/PNG/WebP, up to 5MB, 1920×1080 max.</span>
      </div>
      <ApiErrorAlert error={error} />
    </div>
  );
}
