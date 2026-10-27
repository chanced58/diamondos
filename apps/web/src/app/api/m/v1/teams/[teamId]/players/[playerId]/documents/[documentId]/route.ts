/**
 * DELETE: delete a player's document and its file. Responds `{ documentId }`.
 *
 * Roster managers only; same service as the web player documents page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deletePlayerDocument } from '@/lib/services/roster/player-documents';

type Params = { params: { teamId: string; playerId: string; documentId: string } };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await deletePlayerDocument(auth.db, auth.user.id, {
      teamId: params.teamId,
      playerId: params.playerId,
      documentId: params.documentId,
    }),
  );
}
