/**
 * A coach books one of the team's facilities. Body: `CreateBookingInput`
 * without `teamId` (ISO instants). Responds 201 `{ bookingId }`; 409 when it
 * overlaps another booking on that facility. Same service as the web
 * `createBookingAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createBooking } from '@/lib/services/facilities/facilities';

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createBooking(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
