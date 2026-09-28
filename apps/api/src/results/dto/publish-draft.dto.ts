import { Equals, IsBoolean } from 'class-validator';

// Section 5.2 — MANUAL publish requires an explicit, confirmed action,
// same confirm:true pattern used by Module 2's staff-account creation
// (the closest existing precedent for "confirm this consequential
// action" in this codebase).
export class PublishDraftDto {
  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}
