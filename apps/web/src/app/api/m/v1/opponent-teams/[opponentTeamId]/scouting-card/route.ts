/**
 * GET: an opponent's latest AI scouting card (null before the first) and how
 * many games we've played them. Responds `ScoutingCardResponse`.
 *
 * POST: generates a new card from our past games against them — an AI call
 * that can take a minute. Responds 201 `{ card }`; 409 with no prior games.
 *
 * Coaches of the team that owns the opponent; same service as the web page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { generateScoutingCard, loadScoutingCard } from '@/lib/services/scouting/scouting-card';

type Params = { params: { opponentTeamId: string } };

// Generation waits on the model; give it room on hosts that cap route time.
export const maxDuration = 120;

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadScoutingCard(auth.db, auth.user.id, { opponentTeamId: params.opponentTeamId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(
    await generateScoutingCard(auth.db, auth.user.id, { opponentTeamId: params.opponentTeamId }),
    201,
  );
}
