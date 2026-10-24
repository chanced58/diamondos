/**
 * A coach creates an announcement or topic channel for the team; every active
 * member joins. Body: `CreateTeamChannelInput` without `teamId`. Responds 201
 * `{ channelId }`. Same service as the web New Channel form.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createTeamChannel } from '@/lib/services/messaging/team-messaging';

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createTeamChannel(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
