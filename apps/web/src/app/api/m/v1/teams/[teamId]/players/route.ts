/**
 * POST: add a player to the team's roster. Body: `CreateRosterPlayerInput`
 * without `teamId`. Responds 201 `{ playerId, invited }`; with an email the
 * player is also invited to the team.
 *
 * Roster managers only; same service as the web Add Player action.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createRosterPlayer } from '@/lib/services/roster/roster-players';

type Params = { params: { teamId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createRosterPlayer(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
