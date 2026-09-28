import { ConflictException, NotFoundException } from '@nestjs/common';
import { TracksService } from './tracks.service';

function makePrisma() {
  return { track: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
}

function makeMarkdown() {
  return { renderToSafeHtml: jest.fn((s: string) => `<p>${s}</p>`) };
}

describe('TracksService', () => {
  it('rejects creating a track whose name already exists on this event', async () => {
    const prisma = makePrisma();
    prisma.track.findUnique.mockResolvedValue({ id: 't1' });
    const service = new TracksService(prisma as any, makeMarkdown() as any);

    await expect(
      service.createTrack('event-1', { name: 'AI/ML' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s updating a track that belongs to a different event', async () => {
    const prisma = makePrisma();
    prisma.track.findUnique.mockResolvedValue({ id: 't1', eventId: 'event-OTHER' });
    const service = new TracksService(prisma as any, makeMarkdown() as any);

    await expect(
      service.updateTrack('event-1', 't1', { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renders description through the shared markdown service', async () => {
    const prisma = makePrisma();
    prisma.track.findUnique.mockResolvedValue(null);
    prisma.track.create.mockResolvedValue({ id: 't1', description: 'hello' });
    const markdown = makeMarkdown();
    const service = new TracksService(prisma as any, markdown as any);

    const result = await service.createTrack('event-1', { name: 'AI/ML', description: 'hello' });

    expect(markdown.renderToSafeHtml).toHaveBeenCalledWith('hello');
    expect(result.descriptionHtml).toBe('<p>hello</p>');
  });
});
