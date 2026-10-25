/**
 * The team's practice templates that aren't archived. Coaches only. Responds
 * `PracticeTemplatesResponse` (`@baseball/shared`).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { listPracticeTemplates } from '@/lib/services/practices/practice-templates';

/** See `listPracticeTemplates`. */
export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await listPracticeTemplates(auth.db, auth.user.id, { teamId: params.teamId }));
}
