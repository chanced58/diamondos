/**
 * GET: the team's seasons, newest first. Responds `TeamSeasonsResponse`.
 * POST `{ term, year }`: create a Spring, Summer or Fall season, which takes
 * in the team's games in its dates that have none. Responds 201
 * `CreateSeasonResponse` (`@baseball/shared`).
 *
 * Head coaches, assistants, athletic directors and platform admins; same
 * service as the web team admin Seasons page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createTeamSeason, loadTeamSeasons } from '@/lib/services/seasons/team-seasons';

type Params = { params: { teamId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadTeamSeasons(auth.db, auth.user.id, { teamId: params.teamId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createTeamSeason(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
