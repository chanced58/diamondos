/**
 * Soft-deletes a team channel message: the sender's own, or any for a coach
 * of the channel's team. Responds `{ messageId }`. Phones drop it on their
 * next pull (`deleted_at`). Same service as the web `deleteMessageAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deleteMessage } from '@/lib/services/messaging/team-messaging';

export async function DELETE(req: Request, { params }: { params: { messageId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await deleteMessage(auth.db, auth.user.id, { messageId: params.messageId }));
}
