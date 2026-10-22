/**
 * The mobile live viewer's starting payload: the game, every event and the
 * player names, for anyone the web /live page admits. Responds
 * `LiveGameResponse` (`@baseball/shared`); the app follows new events over
 * Supabase Realtime from there.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLiveGame } from '@/lib/services/live/load-live-game';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLiveGame(auth.db, auth.user.id, { gameId: params.gameId }));
}
