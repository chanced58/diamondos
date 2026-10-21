/**
 * Reset a started or finished game to scheduled from the mobile app. Body:
 * `{ deviceId?: string }` (recorded on the `game_reset` event). Responds
 * `{ gameId }`. Same service as the web `resetGameAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { resetGame } from '@/lib/services/games/reset-game';

const MAX_DEVICE_ID_LENGTH = 100;

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { deviceId?: unknown } | undefined;
  const deviceId =
    typeof body?.deviceId === 'string' && body.deviceId.length > 0 && body.deviceId.length <= MAX_DEVICE_ID_LENGTH
      ? body.deviceId
      : 'mobile';

  return serviceResponse(await resetGame(auth.db, auth.user.id, { gameId: params.gameId }, deviceId));
}
