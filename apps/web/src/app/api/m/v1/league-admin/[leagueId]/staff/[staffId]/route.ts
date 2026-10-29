/**
 * DELETE: take someone off the league's staff. Responds `{ staffId }`.
 * League admins only, never their own seat; same service as the web
 * /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { removeLeagueStaff } from '@/lib/services/league-admin/league-staff';

type Params = { params: { leagueId: string; staffId: string } };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await removeLeagueStaff(auth.db, auth.user.id, { leagueId: params.leagueId, staffId: params.staffId }));
}
