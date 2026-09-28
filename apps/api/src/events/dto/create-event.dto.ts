import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

// Deliberately minimal — see D59 in docs/DECISIONS.md. No slug, no
// description, no timeline-ordering validation beyond this one field;
// Module 3 (Event Management) owns all of that and will replace this
// DTO wholesale.
export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsISO8601()
  eventStartsAt!: string;
}
