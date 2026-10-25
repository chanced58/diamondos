/**
 * POST: a coach plans a practice from drills — each drill a block, in order,
 * and the plan text saved as coach notes. Body: `PlanPracticeInput` without
 * `teamId`. Responds 201 `{ practiceId }`. Same service as the web Plan
 * practice form; 403 on a plan without practice planning.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { planPractice } from '@/lib/services/practices/plan-practice';

/** See `planPractice`. */
export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await planPractice(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
