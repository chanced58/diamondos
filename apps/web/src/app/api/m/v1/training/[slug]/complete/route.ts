/**
 * POST: records a training module complete for the signed-in user, once per
 * curriculum version, and certifies them when it finishes the curriculum.
 * Responds `CompleteTrainingModuleResponse` (`@baseball/shared`); 404 for an
 * unknown module. Same service as the web module page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { completeTrainingModule } from '@/lib/services/training/training';

/** See `completeTrainingModule`. */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await completeTrainingModule(auth.db, auth.user.id, { slug: params.slug }));
}
