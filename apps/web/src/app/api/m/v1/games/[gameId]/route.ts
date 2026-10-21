/**
 * Game detail for the mobile app: the game, the viewer's role, lineup
 * presence, coach takeaways and dual-scorekeeper reconciliation — the same
 * data as the web game page. Responds `GameDetailResponse` (`@baseball/shared`).
 *
 * Auth: Supabase JWT in the Authorization header (see lib/api/bearer-auth).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadGameDetail } from '@/lib/services/games/load-game-detail';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadGameDetail(auth.db, auth.user.id, { gameId: params.gameId }));
}
