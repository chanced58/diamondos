/**
 * GET: the league's teams (active and inactive) and divisions, and what the
 * viewer can change. Responds `LeagueTeamsResponse` (`@baseball/shared`).
 * League staff only; same service as the web /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueTeams } from '@/lib/services/league-admin/league-teams';

type Params = { params: { leagueId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeagueTeams(auth.db, auth.user.id, { leagueId: params.leagueId }));
}
