/**
 * POST: make the season the team's active one (the one before it is
 * deactivated). Responds `{ ok: true }`.
 *
 * Head coaches, assistants, athletic directors and platform admins; same
 * service as the web team admin Seasons page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { setActiveTeamSeason } from '@/lib/services/seasons/team-seasons';

type Params = { params: { teamId: string; seasonId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await setActiveTeamSeason(auth.db, auth.user.id, { teamId: params.teamId, seasonId: params.seasonId }));
}
