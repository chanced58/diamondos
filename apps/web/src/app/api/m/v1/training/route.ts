/**
 * GET: the signed-in user's training progress — completed modules in the
 * current curriculum, certification, and whether training is offered to them.
 * Responds `TrainingProgressResponse` (`@baseball/shared`).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadTrainingProgress } from '@/lib/services/training/training';

/** See `loadTrainingProgress`. */
export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadTrainingProgress(auth.db, auth.user.id));
}
