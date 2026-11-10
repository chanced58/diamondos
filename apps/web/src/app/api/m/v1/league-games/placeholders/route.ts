/**
 * GET: unknown players still waiting for a match, for a league
 * (`?leagueId=`, league staff) or one league game (`?leagueGameId=`, league
 * staff or a coach or scorekeeper of either team). Same service as the web
 * unmatched-players pages.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { listUnmatchedPlaceholders } from '@/lib/services/league-games/placeholders';

export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const params = new URL(req.url).searchParams;
  const leagueId = params.get('leagueId');
  const input = leagueId ? { leagueId } : { leagueGameId: params.get('leagueGameId') };
  return serviceResponse(await listUnmatchedPlaceholders(auth.db, auth.user.id, input));
}
