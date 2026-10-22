/**
 * GET: the game's opponent team, active roster and batting order for a coach.
 * Responds `OpponentLineupResponse` (`@baseball/shared`).
 *
 * PUT: replace the opponent batting order. Body: `{ entries }` as in
 * `SaveOpponentLineupInput`. Responds `{ gameId }`. Same service as the web
 * `saveOpponentLineupAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { loadOpponentLineup } from '@/lib/services/opponent-lineup/load-opponent-lineup';
import { saveOpponentLineup } from '@/lib/services/opponent-lineup/opponent-batting-order';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadOpponentLineup(auth.db, auth.user.id, { gameId: params.gameId }));
}

export async function PUT(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { entries?: unknown } | undefined;
  return serviceResponse(
    await saveOpponentLineup(auth.db, auth.user.id, { gameId: params.gameId, entries: body?.entries }),
  );
}
