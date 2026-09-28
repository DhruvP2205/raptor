import { IsEmail } from 'class-validator';

export class InviteJudgeDto {
  @IsEmail()
  email!: string;
}
