/**
 * GET: a player on the team. Responds `RosterPlayerResponse`
 * (`@baseball/shared`) to those who may open the player's page: roster
 * managers, team staff, the player and their linked parents.
 *
 * PATCH: replace an active player's editable fields. Body:
 * `UpdateRosterPlayerInput` without `teamId` / `playerId`. Responds
 * `{ playerId }`. Roster managers only.
 *
 * Same services as the web player page and its actions.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { loadRosterPlayer, updateRosterPlayer } from '@/lib/services/roster/roster-players';

type Params = { params: { teamId: string; playerId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadRosterPlayer(auth.db, auth.user.id, { teamId: params.teamId, playerId: params.playerId }));
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await updateRosterPlayer(auth.db, auth.user.id, { ...fields, teamId: params.teamId, playerId: params.playerId }),
  );
}
