/**
 * A game's Home Team (GameChanger) export for the mobile share sheet: the
 * same ZIP of CSVs as the web stats page's download, from `buildGameExport`.
 * Responds `application/zip`, or the usual `{ error, code }` JSON on failure
 * (409 before the game starts or without an opponent).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { zipResponse } from '@/lib/api/zip-response';
import { buildGameExport } from '@/lib/services/games/build-game-export';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const result = await buildGameExport(auth.db, auth.user.id, { gameId: params.gameId });
  return result.ok ? zipResponse(result.data) : serviceResponse(result);
}
