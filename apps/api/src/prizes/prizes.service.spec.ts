import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrizesService } from './prizes.service';

function makePrisma() {
  return {
    track: { findUnique: jest.fn() },
    prize: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
}

describe('PrizesService', () => {
  it('rejects a prize referencing a track from a different event (cross-event isolation)', async () => {
    const prisma = makePrisma();
    prisma.track.findUnique.mockResolvedValue({ id: 'track-1', eventId: 'event-OTHER' });
    const service = new PrizesService(prisma as any);

    await expect(
      service.createPrize('event-1', { name: 'Best Hack', rank: 1, trackId: 'track-1', decidedBy: 'JUDGES' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a prize with no track fine (event-wide prize)', async () => {
    const prisma = makePrisma();
    prisma.prize.create.mockResolvedValue({ id: 'p1' });
    const service = new PrizesService(prisma as any);

    await service.createPrize('event-1', { name: 'Best Overall', rank: 1, decidedBy: 'JUDGES' });

    expect(prisma.prize.create).toHaveBeenCalledWith({
      data: { eventId: 'event-1', name: 'Best Overall', rank: 1, trackId: null, decidedBy: 'JUDGES', prizeUsd: null },
    });
  });

  it('404s updating a prize that belongs to a different event', async () => {
    const prisma = makePrisma();
    prisma.prize.findUnique.mockResolvedValue({ id: 'p1', eventId: 'event-OTHER' });
    const service = new PrizesService(prisma as any);

    await expect(
      service.updatePrize('event-1', 'p1', { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
