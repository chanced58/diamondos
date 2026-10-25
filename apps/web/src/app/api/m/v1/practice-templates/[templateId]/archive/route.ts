/** A coach archives a template; it leaves the list. Responds `{ templateId }`. */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { archivePracticeTemplate } from '@/lib/services/practices/practice-templates';

/** See `archivePracticeTemplate`. */
export async function POST(req: Request, { params }: { params: { templateId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await archivePracticeTemplate(auth.db, auth.user.id, { templateId: params.templateId }));
}
