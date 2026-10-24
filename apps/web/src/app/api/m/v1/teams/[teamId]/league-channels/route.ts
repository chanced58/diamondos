/**
 * The league channels of the team's league that the caller is a member of,
 * as the web Messages sidebar lists them. Responds `LeagueChannelsResponse`
 * (`@baseball/shared`); a team in no league gets `leagueName: null` and none.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { listLeagueChannels } from '@/lib/services/messaging/league-messaging';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await listLeagueChannels(auth.db, auth.user.id, { teamId: params.teamId }));
}
