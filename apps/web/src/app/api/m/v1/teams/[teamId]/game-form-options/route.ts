/**
 * What the mobile game form offers for a team: the opponent teams a coach may
 * pick (the team's own plus its league's). Responds `GameFormOptions`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadGameFormOptions } from '@/lib/services/games/load-game-form-options';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadGameFormOptions(auth.db, auth.user.id, { teamId: params.teamId }));
}
