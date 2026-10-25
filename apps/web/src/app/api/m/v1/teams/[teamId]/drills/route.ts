/**
 * GET: the drill library — the curated drills and the team's own. Responds
 * `DrillsListResponse` (`@baseball/shared`); 403 on a plan without practice
 * planning.
 *
 * POST: a coach adds a team drill. Body: `{ drill }` (`createDrillSchema`).
 * Responds 201 `{ drillId }`. Same service as the web New drill form.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createTeamDrill, listTeamDrills } from '@/lib/services/practices/drills';

type Params = { params: { teamId: string } };

/** The team's drill library; see `listTeamDrills`. */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await listTeamDrills(auth.db, auth.user.id, { teamId: params.teamId }));
}

/** Adds a drill to the team in the path; see `createTeamDrill`. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createTeamDrill(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
