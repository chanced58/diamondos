/**
 * A coach adds a player to an opponent team's roster. Body:
 * `AddOpponentTeamPlayerInput` without `opponentTeamId`. Responds 201
 * `{ playerId }`. Same service as the web roster form.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { addOpponentTeamPlayer } from '@/lib/services/opponent-teams/opponent-teams';

export async function POST(req: Request, { params }: { params: { opponentTeamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await addOpponentTeamPlayer(auth.db, auth.user.id, { ...fields, opponentTeamId: params.opponentTeamId }),
    201,
  );
}
