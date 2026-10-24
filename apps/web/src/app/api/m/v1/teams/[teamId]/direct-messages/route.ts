/**
 * Opens the team DM with another active member, creating it the first time.
 * Body: `{ targetUserId }`. Responds `{ channelId }`; 403 when the team's plan
 * has no direct messages. Same service as the web New Direct Message page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { startDirectMessage } from '@/lib/services/messaging/team-messaging';

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await startDirectMessage(auth.db, auth.user.id, { ...fields, teamId: params.teamId }));
}
