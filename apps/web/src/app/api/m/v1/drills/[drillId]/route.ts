/**
 * GET `?teamId=`: one drill as that team sees it — its deficit tags and
 * whether the viewer may edit. Responds `DrillDetailResponse`
 * (`@baseball/shared`); 404 for another team's drill.
 *
 * PATCH: a coach replaces one of the team's drills' fields. Body: `{ drill }`
 * (`createDrillSchema`). Responds `{ drillId }`.
 *
 * DELETE: a coach removes one of the team's drills. Responds `{ drillId }`.
 * Curated drills are never changed (403).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { deleteTeamDrill, loadDrill, updateTeamDrill } from '@/lib/services/practices/drills';

type Params = { params: { drillId: string } };

/** See `loadDrill`. */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const teamId = new URL(req.url).searchParams.get('teamId');
  return serviceResponse(await loadDrill(auth.db, auth.user.id, { teamId, drillId: params.drillId }));
}

/** See `updateTeamDrill`. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await updateTeamDrill(auth.db, auth.user.id, { ...fields, drillId: params.drillId }));
}

/** See `deleteTeamDrill`. */
export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await deleteTeamDrill(auth.db, auth.user.id, { drillId: params.drillId }));
}
