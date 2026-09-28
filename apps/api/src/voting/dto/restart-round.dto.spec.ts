import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RestartRoundDto } from './restart-round.dto';

// Section 7, docs/stages/11-voting.md — "every restart requires a
// mandatory written reason (non-empty, enforced at the API level)."
// Enforced by the global ValidationPipe rejecting the DTO before
// VotingService.restartRound ever runs — tested here at the DTO layer.
describe('RestartRoundDto', () => {
  const validTimeline = {
    votingOpensAt: '2027-02-05T00:00:00Z',
    votingClosesAt: '2027-02-10T00:00:00Z',
    votingWinnerAnnounceAt: '2027-02-12T00:00:00Z',
  };

  it('rejects an empty reason', async () => {
    const dto = plainToInstance(RestartRoundDto, { ...validTimeline, reason: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a missing reason', async () => {
    const dto = plainToInstance(RestartRoundDto, { ...validTimeline });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('accepts a non-empty reason and valid timeline fields', async () => {
    const dto = plainToInstance(RestartRoundDto, { ...validTimeline, reason: 'wrong shortlist submitted' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
