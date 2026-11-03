/**
 * Routes that belong to the signed-in app and follow the user's theme preference.
 * Everything else (public pages, `(auth)`, `/auth/*`) always renders Light.
 *
 * Top-level `(app)` folders are listed by name. `(app)/players` is listed per
 * subfolder, never as bare `/players`, because `(auth)/players/signup` is public.
 * A disk-walk test keeps this list in sync with `src/app/(app)`.
 */
export const THEMED_PATH_PREFIXES: readonly string[] = [
  '/admin',
  '/analytics',
  '/bullpen',
  '/compliance',
  '/dashboard',
  '/games',
  '/league',
  '/live',
  '/messages',
  '/players/me',
  '/practices',
  '/schedule',
  '/settings',
  '/teams',
  '/tournaments',
  '/training',
];

/** True when `pathname` is a signed-in app route. Matches on a segment boundary. */
export function isThemedPath(pathname: string): boolean {
  return THEMED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
