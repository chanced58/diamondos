/**
 * DELETE: remove a team from the league for good. Responds `{ membershipId }`.
 * League admins only; same service as the web /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { removeLeagueTeam } from '@/lib/services/league-admin/league-teams';

type Params = { params: { leagueId: string; membershipId: string } };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await removeLeagueTeam(auth.db, auth.user.id, { leagueId: params.leagueId, membershipId: params.membershipId }));
}
