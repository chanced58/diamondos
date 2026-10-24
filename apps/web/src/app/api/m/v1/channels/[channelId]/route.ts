/**
 * GET: a team channel the caller belongs to — its display name, whether they
 * can post, whether they coach (delete any message, delete the channel) and
 * the members' roles for name badges. Marks the channel read, as the web page
 * does. Responds `ChannelDetailResponse` (`@baseball/shared`).
 *
 * DELETE: a coach deletes an announcement or topic channel. Responds
 * `{ channelId }`; 409 for a DM.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deleteChannel, loadChannel } from '@/lib/services/messaging/team-messaging';

type Params = { params: { channelId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadChannel(auth.db, auth.user.id, { channelId: params.channelId }));
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await deleteChannel(auth.db, auth.user.id, { channelId: params.channelId }));
}
