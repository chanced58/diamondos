/**
 * A coach removes a booking on one of the team's facilities. Responds
 * `{ bookingId }`. Same service as the web `deleteBookingAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deleteBooking } from '@/lib/services/facilities/facilities';

export async function DELETE(req: Request, { params }: { params: { teamId: string; bookingId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await deleteBooking(auth.db, auth.user.id, { teamId: params.teamId, bookingId: params.bookingId }),
  );
}
