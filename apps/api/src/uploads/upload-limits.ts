// Section 7.1, docs/stages/03-event-management.md.
export const UPLOAD_LIMITS = {
  thumbnail: { maxBytes: 2 * 1024 * 1024, maxWidth: 800, maxHeight: 800 },
  poster: { maxBytes: 5 * 1024 * 1024, maxWidth: 1920, maxHeight: 1080 },
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;

// JPEG/PNG/WebP only, no SVG (Section 7.2) — SVG is deliberately
// excluded here even though it's allowed elsewhere in the eventual
// design (certificate templates, per docs/DECISIONS.md) because that
// context has its own dedicated sanitization pipeline for SVG-as
// -template; a plain poster/thumbnail has no reason to be a vector
// format and allowing it here would just reopen an XSS surface.
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
