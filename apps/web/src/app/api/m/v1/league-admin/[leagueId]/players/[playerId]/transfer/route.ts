/**
 * POST: assign a free agent to a team or trade a player. Body:
 * `{ toTeamId, effectiveAt?, reason?, acceptJerseyClear? }`. Responds
 * `{ status: 'moved', transferId }`, or `{ status: 'jersey_conflict', … }`
 * when their jersey number is taken there (resend with
 * `acceptJerseyClear: true` to move them and clear it). 409 while they are in
 * a game in progress.
 *
 * League admins only; same service as the web League Players page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { transferLeaguePlayer } from '@/lib/services/league-admin/league-players';

type Params = { params: { leagueId: string; playerId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await transferLeaguePlayer(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId, playerId: params.playerId }),
  );
}
