import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Opts a route out of the global SessionAuthGuard. Used only for routes
// that must work with no session at all (signup, login, email
// verification) or that deliberately do their own lenient session
// handling instead of the strict guard (logout — see its handler).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
