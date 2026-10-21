/**
 * Seed the opponent batting order from the active roster, everyone on the
 * bench. Responds `{ gameId }`. Same service as the web
 * `autoFillLineupFromRosterAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { autoFillOpponentLineup } from '@/lib/services/opponent-lineup/opponent-batting-order';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await autoFillOpponentLineup(auth.db, auth.user.id, { gameId: params.gameId }));
}
