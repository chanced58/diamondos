/**
 * Record client-side errors reported by the mobile app.
 *
 * Body: `ClientErrorBatch` (`@baseball/shared`). Responds 200 `{ recorded }`.
 * Auth: Supabase JWT in the Authorization header (see lib/api/bearer-auth).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { recordClientErrors } from '@/lib/services/errors/record-client-errors';

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const result = await recordClientErrors(
    auth.db,
    auth.user.id,
    await readJsonBody(req),
    'mobile',
    req.headers.get('x-app-version'),
  );
  return serviceResponse(result);
}
