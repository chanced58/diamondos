/**
 * Replace a play-by-play event: void it and put a new one in its place. Body:
 * `{ eventId, eventType, payload, deviceId? }`. Responds `{ gameId }`. Same
 * service as the web `replaceEventAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { deviceIdFromBody } from '@/lib/api/device-id';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { replaceGameEvent } from '@/lib/services/game-corrections/corrections';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { eventId?: unknown; eventType?: unknown; payload?: unknown } | undefined;
  return serviceResponse(
    await replaceGameEvent(
      auth.db,
      auth.user.id,
      { gameId: params.gameId, eventId: body?.eventId, eventType: body?.eventType, payload: body?.payload },
      deviceIdFromBody(body),
    ),
  );
}
