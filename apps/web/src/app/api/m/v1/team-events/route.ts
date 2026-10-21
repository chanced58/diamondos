/**
 * Create a team event from the mobile app.
 *
 * Body: `CreateTeamEventInput` (`@baseball/shared`), with `startsAt` /
 * `endsAt` as ISO-8601 instants. Responds 201 `{ eventId }`.
 *
 * Auth: Supabase JWT in the Authorization header (see lib/api/bearer-auth).
 * Authorization and validation live in the shared service, the same one the
 * web `createTeamEventAction` calls.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createTeamEvent } from '@/lib/services/team-events/create-team-event';

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const result = await createTeamEvent(auth.db, auth.user.id, await readJsonBody(req));
  return serviceResponse(result, 201);
}
