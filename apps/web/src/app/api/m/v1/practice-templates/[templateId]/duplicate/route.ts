/** A coach copies a template under a new name. Body: `{ newName }`. Responds 201 `{ templateId }` (the copy). */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { duplicatePracticeTemplate } from '@/lib/services/practices/practice-templates';

/** See `duplicatePracticeTemplate`. */
export async function POST(req: Request, { params }: { params: { templateId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await duplicatePracticeTemplate(auth.db, auth.user.id, { ...fields, templateId: params.templateId }), 201);
}
