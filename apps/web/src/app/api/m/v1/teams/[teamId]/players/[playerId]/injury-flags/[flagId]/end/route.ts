/**
 * POST: end a player's flag. Body: `{ endDate: 'YYYY-MM-DD' }` (the device's
 * today). Responds `{ flagId }`. Roster managers only.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { endInjuryFlag } from '@/lib/services/roster/injury-flags';

type Params = { params: { teamId: string; playerId: string; flagId: string } };

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(
    await endInjuryFlag(auth.db, auth.user.id, {
      ...fields,
      teamId: params.teamId,
      playerId: params.playerId,
      flagId: params.flagId,
    }),
  );
}
