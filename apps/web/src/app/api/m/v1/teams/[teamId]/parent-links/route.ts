/**
 * POST: link a parent on the team to a child on its roster. Body:
 * `{ parentUserId, playerId }`. Responds `{ ok: true }`.
 *
 * Member managers; same service as the web team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { linkParent } from '@/lib/services/members/team-members';

type Params = { params: { teamId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await linkParent(auth.db, auth.user.id, { ...fields, teamId: params.teamId }));
}
