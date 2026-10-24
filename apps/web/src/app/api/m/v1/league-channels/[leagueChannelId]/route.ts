/**
 * A league channel the caller belongs to: its details, whether they can post,
 * and the latest messages with their senders' names. Marks the channel read,
 * as the web page does. Responds `LeagueChannelDetailResponse`
 * (`@baseball/shared`); 404 for anyone not in it.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadLeagueChannel } from '@/lib/services/messaging/league-messaging';

export async function GET(req: Request, { params }: { params: { leagueChannelId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeagueChannel(auth.db, auth.user.id, { leagueChannelId: params.leagueChannelId }));
}
