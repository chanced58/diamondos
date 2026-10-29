/**
 * GET: the league's active staff, admins first. Responds `LeagueStaffResponse`.
 * League admins only; same service as the web /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueStaff } from '@/lib/services/league-admin/league-staff';

type Params = { params: { leagueId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeagueStaff(auth.db, auth.user.id, { leagueId: params.leagueId }));
}
