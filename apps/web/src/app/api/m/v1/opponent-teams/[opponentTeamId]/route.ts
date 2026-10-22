/**
 * GET: an opponent team, its active roster and how many games we've played
 * them. Responds `OpponentTeamDetailResponse` (`@baseball/shared`).
 *
 * PATCH: rename it or change its details. Body: `UpdateOpponentTeamInput`
 * without `opponentTeamId`. Responds `{ opponentTeamId }`.
 *
 * Coaches of the team that owns it; same services as the web pages.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { loadOpponentTeam, updateOpponentTeam } from '@/lib/services/opponent-teams/opponent-teams';

type Params = { params: { opponentTeamId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadOpponentTeam(auth.db, auth.user.id, { opponentTeamId: params.opponentTeamId }));
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await updateOpponentTeam(auth.db, auth.user.id, { ...fields, opponentTeamId: params.opponentTeamId }),
  );
}
