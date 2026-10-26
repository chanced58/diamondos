/**
 * GET `[?season=]`: a team's stat page in the league — record, rank,
 * team stats and the batting and pitching tables — as a signed-in viewer sees
 * the web /l/:slug/team/:teamId page. Responds `LeagueTeamResponse`
 * (`@baseball/shared`); 404 for a team unknown to the league that season.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueTeam } from '@/lib/services/league-home/load-league-team';

// `getTeamStatPageData` makes its own Supabase client: keep every fetch in this
// route out of Next's data cache, so the team's stats are never stale.
export const fetchCache = 'force-no-store';

/** See `loadLeagueTeam`. */
export async function GET(req: Request, { params }: { params: { slug: string; teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const season = new URL(req.url).searchParams.get('season') ?? undefined;
  return serviceResponse(await loadLeagueTeam(auth.db, auth.user.id, { slug: params.slug, teamId: params.teamId, season }));
}
