/**
 * PATCH: update an opponent player. Body: `UpdateOpponentPlayerInput` without
 * the path ids. DELETE: remove them from the roster (soft delete). Both
 * respond `{ playerId }` and are scoped to the game's opponent team. Same
 * services as the web roster actions.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { removeOpponentPlayer, updateOpponentPlayer } from '@/lib/services/opponent-lineup/opponent-roster';

type Params = { params: { gameId: string; playerId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await updateOpponentPlayer(auth.db, auth.user.id, { ...fields, gameId: params.gameId, playerId: params.playerId }),
  );
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await removeOpponentPlayer(auth.db, auth.user.id, { gameId: params.gameId, playerId: params.playerId }),
  );
}
