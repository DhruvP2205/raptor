import { IsEmail } from 'class-validator';

export class AddOrganizerDto {
  @IsEmail()
  email!: string;
}
