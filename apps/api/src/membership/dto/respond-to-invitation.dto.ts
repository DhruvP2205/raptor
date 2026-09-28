import { IsBoolean, IsString } from 'class-validator';

export class RespondToInvitationDto {
  @IsString()
  token!: string;

  @IsBoolean()
  accept!: boolean;
}
