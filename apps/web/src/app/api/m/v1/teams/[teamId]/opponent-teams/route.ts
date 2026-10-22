/**
 * GET: the team's own opponent teams with their roster sizes. Responds
 * `OpponentTeamsResponse` (`@baseball/shared`).
 *
 * POST: a new opponent team. Body: `CreateOpponentTeamInput` without
 * `teamId`. Responds 201 `{ opponentTeamId }`.
 *
 * Coaches only; same services as the web /games/opponents pages.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createOpponentTeam, listOpponentTeams } from '@/lib/services/opponent-teams/opponent-teams';

type Params = { params: { teamId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await listOpponentTeams(auth.db, auth.user.id, { teamId: params.teamId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createOpponentTeam(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
