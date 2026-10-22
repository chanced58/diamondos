/**
 * A team's season stats for the mobile Stats tab — pitching (with rest and
 * 7-day counts), hitting, catcher innings and, on plans with opponent
 * tracking, opponents — from the web Stats page's loader. `?season=<id>`
 * picks a season; without it, the active season. Responds
 * `SeasonStatsResponse` (`@baseball/shared`).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadSeasonStats } from '@/lib/services/stats/load-season-stats';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const seasonId = new URL(req.url).searchParams.get('season') || undefined;
  return serviceResponse(await loadSeasonStats(auth.db, auth.user.id, { teamId: params.teamId, seasonId }));
}
