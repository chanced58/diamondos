/**
 * Re-record an at-bat: void its events and replay new ones in place. Body:
 * `ReplayAtBatInput` without `gameId`, plus `deviceId?`. Responds
 * `{ gameId }`. Same service as the web `replayAtBatAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { deviceIdFromBody } from '@/lib/api/device-id';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { replayAtBat } from '@/lib/services/game-corrections/corrections';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await replayAtBat(auth.db, auth.user.id, { ...fields, gameId: params.gameId }, deviceIdFromBody(body)),
  );
}
