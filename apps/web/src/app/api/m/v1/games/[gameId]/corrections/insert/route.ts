/**
 * Add missed play-by-play events, atomically. Body: `{ events, deviceId? }` as
 * in `InsertCorrectionEventsInput`. Responds `{ gameId }`. Same service as the
 * web `insertCorrectionEventAction` / `insertCorrectionEventsBatchAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { deviceIdFromBody } from '@/lib/api/device-id';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { insertCorrectionEvents } from '@/lib/services/game-corrections/corrections';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { events?: unknown } | undefined;
  return serviceResponse(
    await insertCorrectionEvents(auth.db, auth.user.id, { gameId: params.gameId, events: body?.events }, deviceIdFromBody(body)),
  );
}
