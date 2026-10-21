/**
 * A player saves their own self-reflection on a game. Body:
 * `{ playerNotes: string }` (blank clears). Responds `{ gameId, playerId }`.
 * Same service as the web `savePlayerGameNotesAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { savePlayerGameNotes } from '@/lib/services/games/save-game-notes';

export async function PUT(req: Request, { params }: { params: { gameId: string; playerId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { playerNotes?: unknown } | undefined;
  return serviceResponse(
    await savePlayerGameNotes(auth.db, auth.user.id, {
      gameId: params.gameId,
      playerId: params.playerId,
      playerNotes: body?.playerNotes,
    }),
  );
}
