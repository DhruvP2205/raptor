import { IsIn, IsOptional } from 'class-validator';

export class UpdateDraftDto {
  @IsOptional()
  @IsIn(['IN_PROGRESS', 'READY'])
  draftStatus?: 'IN_PROGRESS' | 'READY';

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  publishMode?: 'AUTO' | 'MANUAL';
}
