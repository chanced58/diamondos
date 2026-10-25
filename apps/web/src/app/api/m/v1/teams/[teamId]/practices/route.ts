/**
 * GET: the team's practices that aren't cancelled, oldest first. Responds
 * `PracticesListResponse` (`@baseball/shared`); 403 on a plan without
 * practice planning.
 *
 * POST: a coach logs a practice. Body: `CreatePracticeInput` without
 * `teamId`. Responds 201 `{ practiceId }`. Same service as the web Log
 * practice form.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createPractice, listPractices } from '@/lib/services/practices/practices';

type Params = { params: { teamId: string } };

/** The team's practices; see `listPractices`. */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await listPractices(auth.db, auth.user.id, { teamId: params.teamId }));
}

/** Logs a practice for the team in the path; see `createPractice`. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createPractice(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
