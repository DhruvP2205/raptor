import { IsString } from 'class-validator';

export class RenderMarkdownDto {
  @IsString()
  source!: string;
}
