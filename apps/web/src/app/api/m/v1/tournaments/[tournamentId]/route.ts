/**
 * GET: one tournament — its team, lineup rules, games and the team's batting
 * and pitching lines. Responds `TournamentDetailResponse` (`@baseball/shared`);
 * 404 for a viewer who isn't on the tournament's team.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadTournament } from '@/lib/services/tournaments/load-tournament';

/** See `loadTournament`. */
export async function GET(req: Request, { params }: { params: { tournamentId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadTournament(auth.db, auth.user.id, { tournamentId: params.tournamentId }));
}
