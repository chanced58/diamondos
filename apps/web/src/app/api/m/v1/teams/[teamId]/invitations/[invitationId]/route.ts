/**
 * DELETE: cancel a pending invitation. Responds `{ ok: true }`.
 *
 * Member managers; same service as the web team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { cancelInvitation } from '@/lib/services/members/team-invitations';

type Params = { params: { teamId: string; invitationId: string } };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await cancelInvitation(auth.db, auth.user.id, { teamId: params.teamId, invitationId: params.invitationId }),
  );
}
