/**
 * GET: game detail for the mobile app — the game, the viewer's role, lineup
 * presence, coach takeaways and dual-scorekeeper reconciliation, as the web
 * game page shows them. Responds `GameDetailResponse` (`@baseball/shared`).
 *
 * PATCH: edit the game. Body: `UpdateGameFormInput` without `gameId` (taken
 * from the path). Responds `{ gameId }`. Same service as the web
 * `updateGameAction`.
 *
 * Auth: Supabase JWT in the Authorization header (see lib/api/bearer-auth).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { loadGameDetail } from '@/lib/services/games/load-game-detail';
import { updateGame } from '@/lib/services/games/update-game';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadGameDetail(auth.db, auth.user.id, { gameId: params.gameId }));
}

export async function PATCH(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await updateGame(auth.db, auth.user.id, { ...fields, gameId: params.gameId }));
}
