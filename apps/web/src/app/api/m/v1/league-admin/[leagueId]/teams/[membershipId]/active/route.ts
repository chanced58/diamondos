/**
 * POST: activate or deactivate a team in the league. Body:
 * `{ isActive: boolean }`. Responds `{ membershipId }`.
 * League admins only; same service as the web /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { setLeagueTeamActive } from '@/lib/services/league-admin/league-teams';

type Params = { params: { leagueId: string; membershipId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await setLeagueTeamActive(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId, membershipId: params.membershipId }),
  );
}
