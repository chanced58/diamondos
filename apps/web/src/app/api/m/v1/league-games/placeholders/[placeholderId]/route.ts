/**
 * POST: match an unknown player. Body is one of
 * `{ action: 'link', playerId }`, `{ action: 'create', firstName, lastName, jerseyNumber? }`
 * or `{ action: 'fill_in' }`. Responds `{ playerId }` (null for a fill-in).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { resolvePlaceholder } from '@/lib/services/league-games/placeholders';

type Params = { params: { placeholderId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await resolvePlaceholder(auth.db, auth.user.id, { ...fields, placeholderId: params.placeholderId }));
}
