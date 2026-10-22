/**
 * GET: the team's facilities and the bookings starting in `?from=&to=` (ISO
 * instants, at most six weeks apart). Responds `FacilityScheduleResponse`
 * (`@baseball/shared`). Any team member.
 *
 * POST: a coach adds a facility. Body: `CreateFacilityInput` without
 * `teamId`. Responds 201 `{ facilityId }`; 409 for a duplicate name.
 *
 * Same services as the web /schedule page and its actions.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createFacility, loadFacilitySchedule } from '@/lib/services/facilities/facilities';

type Params = { params: { teamId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const search = new URL(req.url).searchParams;
  return serviceResponse(
    await loadFacilitySchedule(auth.db, auth.user.id, {
      teamId: params.teamId,
      from: search.get('from'),
      to: search.get('to'),
    }),
  );
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createFacility(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
