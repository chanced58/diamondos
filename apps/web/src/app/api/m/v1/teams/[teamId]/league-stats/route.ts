/**
 * Every player's batting and pitching across the team's league (the web
 * League Stats page), for members of a team in a league. Responds
 * `LeagueStatsResponse` (`@baseball/shared`); 404 when the team isn't in one.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueStats } from '@/lib/services/league-stats/league-stats';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeagueStats(auth.db, auth.user.id, { teamId: params.teamId }));
}
