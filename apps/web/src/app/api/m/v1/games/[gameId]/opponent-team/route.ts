/**
 * Name the game's opponent team: rename the linked team, or create one and
 * link it. Body: `{ name }`. Responds `{ opponentTeamId }`. Same service as
 * the web `saveOpponentTeamAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { saveOpponentTeam } from '@/lib/services/opponent-lineup/opponent-team';

export async function PUT(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { name?: unknown } | undefined;
  return serviceResponse(await saveOpponentTeam(auth.db, auth.user.id, { gameId: params.gameId, name: body?.name }));
}
