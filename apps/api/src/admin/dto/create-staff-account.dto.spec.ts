import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStaffAccountDto } from './create-staff-account.dto';

// Section 2.3 step 2: "admin must confirm the choice explicitly... a
// request that skips confirmation does not create the account." That's
// enforced by the global ValidationPipe rejecting the DTO before
// AdminService ever runs — tested here at the DTO layer, not by
// expecting the service to re-check it.
describe('CreateStaffAccountDto', () => {
  const base = {
    email: 'judge@example.com',
    displayName: 'New Judge',
    temporaryPassword: 'temporary123',
    role: 'JUDGE' as const,
  };

  it('rejects a request with confirm missing', async () => {
    const dto = plainToInstance(CreateStaffAccountDto, { ...base });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'confirm')).toBe(true);
  });

  it('rejects a request with confirm: false', async () => {
    const dto = plainToInstance(CreateStaffAccountDto, {
      ...base,
      confirm: false,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'confirm')).toBe(true);
  });

  it('accepts a request with confirm: true and a valid role', async () => {
    const dto = plainToInstance(CreateStaffAccountDto, {
      ...base,
      confirm: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a role outside JUDGE|ORGANIZER', async () => {
    const dto = plainToInstance(CreateStaffAccountDto, {
      ...base,
      role: 'PARTICIPANT',
      confirm: true,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});
