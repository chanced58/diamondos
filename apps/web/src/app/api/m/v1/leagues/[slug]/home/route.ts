/**
 * GET `[?season=&teamId=]`: the league home — standings, League Leaders,
 * spotlights, recent and upcoming games — as a signed-in viewer sees the web
 * /l/:slug page. `teamId` marks the viewer's own team. Responds
 * `LeagueHomeResponse` (`@baseball/shared`); 404 for an unknown league.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueHome } from '@/lib/services/league-home/load-league-home';

/** See `loadLeagueHome`. */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const query = new URL(req.url).searchParams;
  return serviceResponse(
    await loadLeagueHome(auth.db, auth.user.id, {
      slug: params.slug,
      season: query.get('season') ?? undefined,
      teamId: query.get('teamId') ?? undefined,
    }),
  );
}
