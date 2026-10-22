/**
 * A started game's box score for the mobile app: line score plus batting,
 * pitching and fielding for both sides, from the same loader as the web stats
 * page. Responds `GameBoxScoreResponse` (`@baseball/shared`); 409 before the
 * game starts.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadGameBoxScore } from '@/lib/services/games/load-game-box-score';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadGameBoxScore(auth.db, auth.user.id, { gameId: params.gameId }));
}
