/**
 * GET: a player's injury and availability flags and the injuries the team can
 * flag. Responds `PlayerAvailabilityResponse` (`@baseball/shared`).
 *
 * POST: add a flag. Body: `AddInjuryFlagInput` without `teamId` /
 * `playerId`. Responds 201 `{ flagId }`, or 409 when an open-ended flag for
 * the injury already exists.
 *
 * Roster managers only; same services as the web availability page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { addInjuryFlag, loadPlayerAvailability } from '@/lib/services/roster/injury-flags';

type Params = { params: { teamId: string; playerId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadPlayerAvailability(auth.db, auth.user.id, { teamId: params.teamId, playerId: params.playerId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await addInjuryFlag(auth.db, auth.user.id, { ...fields, teamId: params.teamId, playerId: params.playerId }),
    201,
  );
}
