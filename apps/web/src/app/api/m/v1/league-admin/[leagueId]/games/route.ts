/**
 * GET: the league's scheduled games (optional `?season=`, else every season),
 * each with teams, venue, status and score. League staff.
 * POST: schedule a game. Body: `{ homeTeamId, awayTeamId, date, time, timeZone, venueName? }`.
 * Responds 201 `{ leagueGameId, homeGameId, awayGameId }`. League admins only.
 * Same services as the web /league/admin/games page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createLeagueGame, listLeagueGames } from '@/lib/services/league-games/league-games';

type Params = { params: { leagueId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const season = new URL(req.url).searchParams.get('season');
  return serviceResponse(
    await listLeagueGames(auth.db, auth.user.id, { leagueId: params.leagueId, ...(season ? { season } : {}) }),
  );
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createLeagueGame(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId }), 201);
}
