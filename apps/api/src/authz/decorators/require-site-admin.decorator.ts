import { SetMetadata } from '@nestjs/common';

export const REQUIRE_SITE_ADMIN_KEY = 'requireSiteAdmin';

// Marks a route as siteAdmin-only (e.g. POST /admin/staff-accounts).
// Distinct from EventRoleGuard's siteAdmin *bypass* — this is for
// routes that have no per-event scope at all, so there's nothing to
// bypass into; siteAdmin is simply the required identity.
export const RequireSiteAdmin = () => SetMetadata(REQUIRE_SITE_ADMIN_KEY, true);
