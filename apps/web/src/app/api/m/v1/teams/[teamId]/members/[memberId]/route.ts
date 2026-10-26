/**
 * PATCH: change a member's role. Body: `{ role }`. Responds `{ ok: true }`.
 *
 * DELETE: take a member off the team (their invitations are cancelled too).
 * Responds `{ ok: true }`.
 *
 * Member managers, never on their own membership; same services as the web
 * team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { removeMember, updateMemberRole } from '@/lib/services/members/team-members';

type Params = { params: { teamId: string; memberId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await updateMemberRole(auth.db, auth.user.id, { ...fields, teamId: params.teamId, memberId: params.memberId }),
  );
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await removeMember(auth.db, auth.user.id, { teamId: params.teamId, memberId: params.memberId }));
}
