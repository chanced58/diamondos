/**
 * GET: a link to a player's document file that works for a minute. Responds
 * `{ url }`.
 *
 * Roster managers only; same service as the web player documents page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { playerDocumentUrl } from '@/lib/services/roster/player-documents';

type Params = { params: { teamId: string; playerId: string; documentId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await playerDocumentUrl(auth.db, auth.user.id, {
      teamId: params.teamId,
      playerId: params.playerId,
      documentId: params.documentId,
    }),
  );
}
