/**
 * POST: release a player into the league's free-agent pool. Body:
 * `{ effectiveAt?, reason? }`. Responds `{ transferId }`; 409 while they are
 * in a game in progress or already a free agent.
 *
 * League admins only; same service as the web League Players page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { releaseLeaguePlayer } from '@/lib/services/league-admin/league-players';

type Params = { params: { leagueId: string; playerId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await releaseLeaguePlayer(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId, playerId: params.playerId }),
  );
}
