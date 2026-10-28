/**
 * POST: add a division. Body: `{ name }`. Responds 201 `{ divisionId }`, or
 * 409 when the league already has one by that name.
 * League staff; same service as the web /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { addLeagueDivision } from '@/lib/services/league-admin/league-teams';

type Params = { params: { leagueId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await addLeagueDivision(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId }), 201);
}
