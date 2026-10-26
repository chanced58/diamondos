/**
 * POST: take a player off the active roster, keeping their stats and history
 * (the web player page's Deactivate). Responds `{ playerId }`. Roster managers
 * only; an inactive player is left as is.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deactivateRosterPlayer } from '@/lib/services/roster/roster-players';

type Params = { params: { teamId: string; playerId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await deactivateRosterPlayer(auth.db, auth.user.id, { teamId: params.teamId, playerId: params.playerId, reason: 'deactivated' }),
  );
}
