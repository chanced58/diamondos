/**
 * Delete a play-by-play event by appending a void marker. Body:
 * `{ eventId, deviceId? }`. Responds `{ gameId }`. Same service as the web
 * `voidEventAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { deviceIdFromBody } from '@/lib/api/device-id';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { voidGameEvent } from '@/lib/services/game-corrections/corrections';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { eventId?: unknown } | undefined;
  return serviceResponse(
    await voidGameEvent(auth.db, auth.user.id, { gameId: params.gameId, eventId: body?.eventId }, deviceIdFromBody(body)),
  );
}
