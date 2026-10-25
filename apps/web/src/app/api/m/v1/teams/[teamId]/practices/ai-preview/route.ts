/**
 * Claude drafts a practice from the coach's description and the team's drill
 * library; nothing is saved. Body: `AiPracticePreviewInput` without `teamId`.
 * Responds `AiPracticePreviewResponse` (`@baseball/shared`). Waits on the model.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { previewAiPractice } from '@/lib/services/practices/ai-practice';

/** Drafts a practice; see `previewAiPractice`. */
export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await previewAiPractice(auth.db, auth.user.id, { ...fields, teamId: params.teamId }));
}
