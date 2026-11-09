/**
 * GET: the hand-entered result for a league game, both rosters and whether
 * the caller may edit. POST: save a result (`kind`: final | box | batting |
 * forfeit; see `manualResultInputSchema`). Responds `{ leagueGameId }`.
 * Same service as the web league game result page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { enterManualResult, loadManualResult } from '@/lib/services/league-games/manual-result';

type Params = { params: { leagueGameId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;
  return serviceResponse(await loadManualResult(auth.db, auth.user.id, { leagueGameId: params.leagueGameId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await enterManualResult(auth.db, auth.user.id, { ...fields, leagueGameId: params.leagueGameId }));
}
