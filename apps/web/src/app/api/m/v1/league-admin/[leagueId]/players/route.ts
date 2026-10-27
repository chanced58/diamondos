/**
 * GET: the league's players, its teams and divisions, and whether the viewer
 * can edit. Responds `LeaguePlayersResponse` (`@baseball/shared`). League
 * staff only.
 *
 * POST: register a player. Body: `CreateLeaguePlayerInput` without
 * `leagueId`. Responds 201 `{ playerId }`. League admins only.
 *
 * Same services as the web /league/admin/players page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createLeaguePlayer, loadLeaguePlayers } from '@/lib/services/league-admin/league-players';

type Params = { params: { leagueId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeaguePlayers(auth.db, auth.user.id, { leagueId: params.leagueId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createLeaguePlayer(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId }), 201);
}
