import { SetMetadata } from '@nestjs/common';
import type { EventRole } from '@prisma/client';

export const REQUIRE_EVENT_ROLE_KEY = 'requireEventRole';

// Declares a route's event-scoped role requirement. EventRoleGuard
// resolves :eventId from the request path and checks the current
// user's EventMembership for THAT event only — never a global role
// flag. See docs/stages/02-roles-and-membership.md Section 4.
//
// Every route using this MUST also apply EventRoleGuard
// (@UseGuards(EventRoleGuard)) — the decorator alone sets metadata, it
// doesn't enforce anything by itself.
export const RequireEventRole = (role: EventRole) =>
  SetMetadata(REQUIRE_EVENT_ROLE_KEY, role);
