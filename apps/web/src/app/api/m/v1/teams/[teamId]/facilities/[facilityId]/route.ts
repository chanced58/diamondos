/**
 * A coach removes one of the team's facilities (its bookings go with it).
 * Responds `{ facilityId }`. Same service as the web `deleteFacilityAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deleteFacility } from '@/lib/services/facilities/facilities';

export async function DELETE(req: Request, { params }: { params: { teamId: string; facilityId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await deleteFacility(auth.db, auth.user.id, { teamId: params.teamId, facilityId: params.facilityId }),
  );
}
