/**
 * Every league team side by side — record, runs, team AVG and ERA (the web
 * Team Comparison page), for members of a team in a league. Responds
 * `LeagueComparisonResponse` (`@baseball/shared`); 404 when the team isn't in one.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueComparison } from '@/lib/services/league-stats/league-stats';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeagueComparison(auth.db, auth.user.id, { teamId: params.teamId }));
}
