/**
 * POST: invite a staff member. Body: `InviteStaffInput` without `teamId`.
 * Responds 201 `{ outcome: 'added' | 'invited' }`.
 *
 * Member managers; same service as the roster's Invite staff form.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { inviteStaff } from '@/lib/services/members/team-invitations';

type Params = { params: { teamId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await inviteStaff(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
