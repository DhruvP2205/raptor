import { Equals, IsBoolean, IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

// "confirm: true" on this same request is the confirmation step
// required before creation (Section 2.3 step 2) — the doc explicitly
// allows this simpler alternative to a second /confirm call. A request
// with confirm missing or false does not create anything; the server
// re-validates this itself rather than trusting that the client only
// sends the field after a real review screen.
export class CreateStaffAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  temporaryPassword!: string;

  @IsIn(['JUDGE', 'ORGANIZER'])
  role!: 'JUDGE' | 'ORGANIZER';

  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}
