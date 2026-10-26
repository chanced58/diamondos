/**
 * POST: send a pending invitation's email again, as recorded. Responds
 * `{ ok: true }`.
 *
 * Member managers; same service as the web team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { resendInvitation } from '@/lib/services/members/team-invitations';

type Params = { params: { teamId: string; invitationId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await resendInvitation(auth.db, auth.user.id, { teamId: params.teamId, invitationId: params.invitationId }),
  );
}
