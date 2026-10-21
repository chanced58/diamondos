/**
 * Venue search suggestions for the mobile game and event forms.
 * Query: `?query=<text>&sessionToken=<uuid>`. Responds `{ predictions }`;
 * 503 when no server Places key is configured (the app then takes a typed
 * venue). See lib/services/places/google-places.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { autocompletePlaces } from '@/lib/services/places/google-places';

export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const params = new URL(req.url).searchParams;
  return serviceResponse(
    await autocompletePlaces(auth.db, auth.user.id, {
      query: params.get('query') ?? '',
      sessionToken: params.get('sessionToken') ?? '',
    }),
  );
}
