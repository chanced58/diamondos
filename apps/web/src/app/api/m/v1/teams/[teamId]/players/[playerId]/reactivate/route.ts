/**
 * POST: bring a disabled player back. Body: `{ jerseyNumber?: number | null }`.
 * Responds `{ playerId }`, or 409 when the number is taken. Roster managers
 * only; an active player is left as is.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { reactivateRosterPlayer } from '@/lib/services/roster/roster-players';

type Params = { params: { teamId: string; playerId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await reactivateRosterPlayer(auth.db, auth.user.id, { ...fields, teamId: params.teamId, playerId: params.playerId }),
  );
}
