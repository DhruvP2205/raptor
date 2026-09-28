import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import { UploadsService } from './uploads.service';

async function makeJpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  });
  if (withExif) {
    image.withMetadata({ exif: { IFD0: { Copyright: 'secret-test-exif-marker' } } });
  }
  return image.jpeg().toBuffer();
}

describe('UploadsService', () => {
  let uploadDir: string;
  const originalUploadDir = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), 'raptor-uploads-test-'));
    process.env.UPLOAD_DIR = uploadDir;
  });

  afterEach(async () => {
    process.env.UPLOAD_DIR = originalUploadDir;
    await rm(uploadDir, { recursive: true, force: true });
  });

  describe('processAndStore', () => {
    it('rejects a file over the size limit for its kind', async () => {
      const service = new UploadsService();
      const oversized = Buffer.alloc(3 * 1024 * 1024); // > 2MB thumbnail limit

      await expect(service.processAndStore(oversized, 'thumbnail')).rejects.toMatchObject({
        response: { code: 'FILE_TOO_LARGE' },
      });
    });

    it('rejects a file with no recognizable image magic bytes (plain text)', async () => {
      const service = new UploadsService();
      const fakeImage = Buffer.from('just some plain text, not an image at all');

      await expect(service.processAndStore(fakeImage, 'poster')).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_FILE_TYPE' },
      });
    });

    it('rejects an SVG disguised with a misleading caller-supplied name (no image magic bytes at all)', async () => {
      // SVG is text/XML — it has no binary magic-byte signature, so the
      // magic-byte check rejects it as unrecognized before any SVG
      // -specific logic would even be needed. This is the mechanism
      // that enforces "no SVG" (Section 7.2), not a dedicated check.
      const service = new UploadsService();
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

      await expect(service.processAndStore(svg, 'poster')).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_FILE_TYPE' },
      });
    });

    it('rejects an image exceeding the max dimensions for its kind, even though it is well under the byte limit', async () => {
      const service = new UploadsService();
      const tooWide = await makeJpeg(1000, 1000); // thumbnail max is 800x800

      await expect(service.processAndStore(tooWide, 'thumbnail')).rejects.toMatchObject({
        response: { code: 'IMAGE_DIMENSIONS_TOO_LARGE' },
      });
    });

    it('accepts a valid image within limits and strips EXIF metadata from the stored result', async () => {
      const service = new UploadsService();
      const withExif = await makeJpeg(400, 400, true);

      // Confirm the fixture actually has EXIF before processing,
      // otherwise this test would trivially pass for the wrong reason.
      const beforeMeta = await sharp(withExif).metadata();
      expect(beforeMeta.exif).toBeDefined();

      const id = await service.processAndStore(withExif, 'thumbnail');
      const stored = await service.read(id);
      const afterMeta = await sharp(stored).metadata();

      expect(afterMeta.exif).toBeUndefined();
    });

    it('produces a different filename for two uploads of the same source image, neither derived from any original name', async () => {
      const service = new UploadsService();
      const image = await makeJpeg(200, 200);

      const id1 = await service.processAndStore(image, 'thumbnail');
      const id2 = await service.processAndStore(image, 'thumbnail');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f-]{36}$/);
      expect(id2).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('read (path traversal defense)', () => {
    it('rejects a non-UUID id outright, before touching the filesystem', async () => {
      const service = new UploadsService();
      await expect(service.read('../../../../etc/passwd')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s a well-formed UUID that was never actually stored', async () => {
      const service = new UploadsService();
      await expect(
        service.read('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
