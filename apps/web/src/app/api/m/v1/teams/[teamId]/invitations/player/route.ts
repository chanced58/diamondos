/**
 * POST: invite a rostered player to the app, or connect them to an existing
 * account. Body: `{ playerId, email? }` (the roster email when none).
 * Responds 201 `{ outcome: 'added' | 'invited' }`.
 *
 * Member managers; same service as the web team admin Users page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { invitePlayer } from '@/lib/services/members/team-invitations';

type Params = { params: { teamId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await invitePlayer(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
