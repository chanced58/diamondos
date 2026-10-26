/**
 * DELETE: unlink a parent from a child on the team's roster. Responds
 * `{ ok: true }`.
 *
 * Member managers; same service as the web team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { unlinkParent } from '@/lib/services/members/team-members';

type Params = { params: { teamId: string; parentUserId: string; playerId: string } };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await unlinkParent(auth.db, auth.user.id, {
      teamId: params.teamId,
      parentUserId: params.parentUserId,
      playerId: params.playerId,
    }),
  );
}
