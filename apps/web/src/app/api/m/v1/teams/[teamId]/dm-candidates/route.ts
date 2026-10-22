/**
 * The team's other active members the caller can start a DM with, by last
 * name. Responds `DmCandidatesResponse` (`@baseball/shared`); 403 when the
 * team's plan has no direct messages.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { listDmCandidates } from '@/lib/services/messaging/team-messaging';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await listDmCandidates(auth.db, auth.user.id, { teamId: params.teamId }));
}
