/**
 * PATCH: a coach edits an opponent player. Body: `UpdateOpponentTeamPlayerInput`
 * without the ids. DELETE: takes them off the roster (their stats stay).
 * Both respond `{ playerId }`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { removeOpponentTeamPlayer, updateOpponentTeamPlayer } from '@/lib/services/opponent-teams/opponent-teams';

type Params = { params: { opponentTeamId: string; playerId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await updateOpponentTeamPlayer(auth.db, auth.user.id, {
      ...fields,
      opponentTeamId: params.opponentTeamId,
      playerId: params.playerId,
    }),
  );
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await removeOpponentTeamPlayer(auth.db, auth.user.id, {
      opponentTeamId: params.opponentTeamId,
      playerId: params.playerId,
    }),
  );
}
