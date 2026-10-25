/**
 * GET: the team's league page — the league, counters, standings by division
 * and staff. Responds `LeaguePageResponse` (`@baseball/shared`); the same
 * service as the web /league page. 404 for a team the viewer isn't on, or one
 * in no league.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeaguePage } from '@/lib/services/league/load-league-page';

/** See `loadLeaguePage`. */
export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeaguePage(auth.db, auth.user.id, { teamId: params.teamId }));
}
