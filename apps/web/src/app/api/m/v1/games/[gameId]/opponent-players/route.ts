/**
 * Add a player to the game's opponent roster. Body: `AddOpponentPlayerInput`
 * without `gameId`. Responds 201 `{ playerId }`. Same service as the web
 * `addOpponentPlayerAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { addOpponentPlayer } from '@/lib/services/opponent-lineup/opponent-roster';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await addOpponentPlayer(auth.db, auth.user.id, { ...fields, gameId: params.gameId }), 201);
}
