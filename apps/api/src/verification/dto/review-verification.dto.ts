import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Section 4 — finalDecision here is only ever the two human-actionable
// values; PENDING_REVIEW is never something an organizer "sets", it's
// only ever a starting/fallback state.
export class ReviewVerificationDto {
  @IsIn(['APPROVED', 'DISQUALIFIED'])
  finalDecision!: 'APPROVED' | 'DISQUALIFIED';

  // Mandatory-when-DISQUALIFIED is enforced in the service, not here —
  // class-validator's @ValidateIf on a sibling field works, but the
  // actual rule ("non-empty after trim") is simple enough to keep in one
  // place alongside the other finalDecision business logic rather than
  // splitting it across the DTO and the service.
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  remarks?: string;
}
