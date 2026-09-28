import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_MUST_RESET_PASSWORD_KEY =
  'allowWhileMustResetPassword';

// The one exemption from MustResetPasswordGuard's lock — applied only
// to POST /auth/set-password. Everything else is unreachable for an
// account with mustResetPassword: true, per
// docs/stages/02-roles-and-membership.md Section 2.3 step 5 ("No other
// route is reachable until a new password is set").
export const AllowWhileMustResetPassword = () =>
  SetMetadata(ALLOW_WHILE_MUST_RESET_PASSWORD_KEY, true);
