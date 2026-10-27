/**
 * GET: one league player, their transfer history and the league's teams.
 * Responds `LeaguePlayerDetailResponse` (`@baseball/shared`). League staff
 * only; same service as the web /league/admin/players/:playerId page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeaguePlayer } from '@/lib/services/league-admin/league-players';

type Params = { params: { leagueId: string; playerId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeaguePlayer(auth.db, auth.user.id, { leagueId: params.leagueId, playerId: params.playerId }));
}
