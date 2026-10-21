/**
 * A picked venue's name, address and coordinates, for the mobile game and
 * event forms. Query: `?sessionToken=<uuid>` (the search's token, closing the
 * billed Places session). Responds `PlaceDetails`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { getPlaceDetails } from '@/lib/services/places/google-places';

export async function GET(req: Request, { params }: { params: { placeId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await getPlaceDetails(auth.db, auth.user.id, {
      placeId: params.placeId,
      sessionToken: new URL(req.url).searchParams.get('sessionToken') ?? '',
    }),
  );
}
