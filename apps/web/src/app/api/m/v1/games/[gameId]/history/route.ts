/**
 * A started game's play-by-play log since its last reset, with the player
 * names to label it. Responds `GameHistoryResponse` (`@baseball/shared`); 409
 * before the game starts. Same reads as the web history page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadGameHistory } from '@/lib/services/game-corrections/load-game-history';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadGameHistory(auth.db, auth.user.id, { gameId: params.gameId }));
}
