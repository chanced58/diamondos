/**
 * Cancel a game from the mobile app. Body: `{ notifyTeam?: boolean }`.
 * Responds `{ gameId }`. Same service as the web `cancelGameAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { cancelGame } from '@/lib/services/games/cancel-game';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { notifyTeam?: unknown } | undefined;
  return serviceResponse(
    await cancelGame(auth.db, auth.user.id, { gameId: params.gameId, notifyTeam: body?.notifyTeam }),
  );
}
