/**
 * Recompute a game's stored score from its event log, from the mobile app.
 * Responds `{ gameId, homeScore, awayScore }`. Same service as the web
 * `recalculateScoresAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { recalculateScores } from '@/lib/services/games/recalculate-scores';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await recalculateScores(auth.db, auth.user.id, { gameId: params.gameId }));
}
