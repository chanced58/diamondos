/**
 * Saves a previewed AI plan as a practice. Body: `CreateAiPracticeInput`
 * without `teamId`. Responds 201 `{ practiceId }`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createPracticeFromAiPlan } from '@/lib/services/practices/ai-practice';

/** Saves the plan; see `createPracticeFromAiPlan`. */
export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createPracticeFromAiPlan(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
