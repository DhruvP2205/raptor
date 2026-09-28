import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { fromBuffer } from 'file-type';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { ALLOWED_MIME_TYPES, UPLOAD_LIMITS, type UploadKind } from './upload-limits';

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
}

// Section 7.2, docs/stages/03-event-management.md. Every control below
// maps to a specific real attack, not a generic "be careful":
//   - size check: resource exhaustion
//   - magic bytes (never extension/declared MIME): both are
//     attacker-controlled and prove nothing
//   - dimension check before full decode: a decompression bomb (a
//     small file engineered to decode into an enormous pixel buffer)
//   - re-encode: strips EXIF (privacy), neutralizes any
//     malformed-file/polyglot exploit, since none of the original
//     bytes survive into what's stored
//   - UUID filename, re-sniffed Content-Type at serve time: path
//     traversal and extension-spoofing at the serving boundary
@Injectable()
export class UploadsService {
  async processAndStore(buffer: Buffer, kind: UploadKind): Promise<string> {
    const limits = UPLOAD_LIMITS[kind];

    if (buffer.length > limits.maxBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${limits.maxBytes}-byte limit for a ${kind}.`,
      });
    }

    const detected = await fromBuffer(buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only JPEG, PNG, and WebP images are allowed.',
      });
    }

    // sharp's metadata() reads only the header, not the full pixel
    // buffer — this check happens before any expensive/memory-risky
    // full decode, per Section 7.2's explicit requirement.
    let width: number | undefined;
    let height: number | undefined;
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Could not read image metadata.',
      });
    }
    if (!width || !height) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Could not determine image dimensions.',
      });
    }
    if (width > limits.maxWidth || height > limits.maxHeight) {
      throw new BadRequestException({
        code: 'IMAGE_DIMENSIONS_TOO_LARGE',
        message: `Image exceeds ${limits.maxWidth}x${limits.maxHeight}.`,
      });
    }

    // Re-encode to one canonical format regardless of input format —
    // "re-encoded fresh to a clean JPEG/PNG/WebP" (Section 7.2) doesn't
    // require preserving the original format, and always producing
    // JPEG keeps the serving route's Content-Type simple and
    // predictable. Flagged as an inference — see D71 in
    // docs/DECISIONS.md.
    const reencoded = await sharp(buffer).rotate().toFormat('jpeg', { quality: 85 }).toBuffer();

    const id = randomUUID();
    await mkdir(uploadDir(), { recursive: true });
    await writeFile(path.join(uploadDir(), id), reencoded);

    return id;
  }

  async read(id: string): Promise<Buffer> {
    // Defense in depth against path traversal: validate the id is
    // actually a UUID before it ever reaches a filesystem path, and
    // strip any directory components as a second layer regardless.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundException();
    }
    const safeName = path.basename(id);
    try {
      return await readFile(path.join(uploadDir(), safeName));
    } catch {
      throw new NotFoundException();
    }
  }

  async detectMimeType(buffer: Buffer): Promise<string> {
    const detected = await fromBuffer(buffer);
    return detected?.mime ?? 'application/octet-stream';
  }
}
