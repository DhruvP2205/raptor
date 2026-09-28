import { IsIn, IsInt, Min } from 'class-validator';

// Section 4 — the two configured inputs plus a checkbox-driven strategy.
// maxProjectsPerJudge itself is not a parameter here — it's Event's own
// setting (PATCH /events/:id), read live by the service, same as manual
// assignment reads it.
export class AutoAssignDto {
  @IsInt()
  @Min(1)
  reviewsPerProject!: number;

  @IsIn(['BY_TRACK', 'RANDOM'])
  strategy!: 'BY_TRACK' | 'RANDOM';
}
