/**
 * GET: the league's scoring settings merged with the defaults, the system
 * pitch-count rulesets and whether the viewer may save. Responds
 * `LeagueScoringSettingsResponse` (`@baseball/shared`). League staff.
 *
 * POST: save them. Body: `{ settings }`, the whole `LeagueScoringSettings`
 * blob. Responds `{ settings }`. League admins only.
 *
 * Same service as the web league admin Scoring Settings form.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { loadLeagueScoringSettings, saveLeagueScoringSettings } from '@/lib/services/league-admin/league-scoring-settings';

type Params = { params: { leagueId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadLeagueScoringSettings(auth.db, auth.user.id, { leagueId: params.leagueId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await saveLeagueScoringSettings(auth.db, auth.user.id, { ...fields, leagueId: params.leagueId }));
}
