/**
 * Schedule a game from the mobile app. Body: `CreateGameFormInput`
 * (`@baseball/shared`) — date and time as the coach typed them; the server
 * resolves the zone. Responds 201 `{ gameId }`. Same service as the web
 * `createGameAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createGame } from '@/lib/services/games/create-game';

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await createGame(auth.db, auth.user.id, await readJsonBody(req)), 201);
}
