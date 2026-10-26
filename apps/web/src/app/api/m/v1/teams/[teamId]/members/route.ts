/**
 * GET: the team's staff, parents (with their children here), players' app
 * accounts and pending invitations. Responds `TeamMembersResponse`
 * (`@baseball/shared`).
 *
 * Member managers (head coaches, assistants, athletic directors, platform
 * admins); same service as the web team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadTeamMembers } from '@/lib/services/members/team-members';

type Params = { params: { teamId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadTeamMembers(auth.db, auth.user.id, { teamId: params.teamId }));
}
